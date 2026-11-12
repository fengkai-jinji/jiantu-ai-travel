# -*- coding: utf-8 -*-
"""在干净评测集与旧 test 上同时跑 products_v2 / products_v3，输出可写进文档的指标。

用法：
  python model-training/indoor/eval/evaluate.py            # 全跑，结果写 eval_results.json / .md

说明：
  - conf=0.001 的整轮用于算 AP（mAP50 / mAP50-95），这是论文口径；
  - conf=0.35 的整轮用于算线上实际工作点的 P / R / F1；
  - 干净集按 GT 框面积中位数再切「近景 / 远景」两档，看两版权重各自的适用区间。
"""
import json
import os
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[3]
WEIGHTS = {
    "v2": REPO / "model-training" / "indoor" / "products_v2" / "weights" / "best.pt",
    "v3": REPO / "model-training" / "indoor" / "products_v3" / "weights" / "best.pt",
}
CLEAN = Path(r"F:/归档/数据集与标注/YOLOv8/datasets/products_clean_test")
LEGACY = Path(r"F:/归档/数据集与标注/YOLOv8/datasets/products_v3")
OUT = Path(__file__).resolve().parent
NAMES = {0: "bottle", 1: "chair", 2: "door"}


def per_class(box):
    """按类别取 AP；不同 ultralytics 版本属性名不一致，逐个兜底。"""
    names = list(getattr(box, "ap_class_index", range(len(box.ap))))
    ap50 = np.atleast_1d(box.ap50)
    ap = np.atleast_1d(box.ap)
    p = np.atleast_1d(box.p)
    r = np.atleast_1d(box.r)
    out = {}
    for i, cls in enumerate(names):
        out[NAMES.get(int(cls), str(cls))] = {
            "ap50": round(float(ap50[i]), 4) if i < len(ap50) else None,
            "ap50_95": round(float(ap[i]), 4) if i < len(ap) else None,
            "precision": round(float(p[i]), 4) if i < len(p) else None,
            "recall": round(float(r[i]), 4) if i < len(r) else None,
        }
    return out


def run(weight, data, split, conf):
    from ultralytics import YOLO
    model = YOLO(str(weight))
    result = model.val(data=str(data / "data.yaml"), split=split, imgsz=640,
                       conf=conf, iou=0.7, verbose=False, plots=False)
    box = result.box
    p, r = float(box.mp), float(box.mr)
    return {"overall": {"mAP50": round(float(box.map50), 4),
                        "mAP50_95": round(float(box.map), 4),
                        "precision": round(p, 4),
                        "recall": round(r, 4)},
            "per_class": per_class(box),
            "f1": round(2 * p * r / (p + r), 4) if p + r else 0.0}


def count_images(root):
    if (root / "images").is_dir():
        return len([p for p in (root / "images").iterdir() if p.is_file()])
    return len([p for p in (root / "test" / "images").iterdir() if p.is_file()])


MARKER = ".jiantu_eval_build"


def prepare_output(path):
    """增量准备子集目录：带标记就直接复用，无标记则改名留档，不做整目录删除。"""
    if not path.exists():
        (path / "images").mkdir(parents=True)
        (path / "labels").mkdir(parents=True)
        return
    if not (path / MARKER).is_file():
        from datetime import datetime
        backup = path.parent / f"{path.name}_备份_{datetime.now():%Y%m%d_%H%M%S}"
        path.rename(backup)
        print(f"  目录 {path.name} 无标记，已改名留档为 {backup.name}（不删除）")
        (path / "images").mkdir(parents=True)
        (path / "labels").mkdir(parents=True)
        return
    (path / "images").mkdir(parents=True, exist_ok=True)
    (path / "labels").mkdir(parents=True, exist_ok=True)


def area_subsets(root, tag, threshold_pairs=((0.15, "near"), (0.05, "far"))):
    """按 GT 框面积中位数把图片硬链接到两个子集目录，避免复制大文件。"""
    import csv
    import shutil
    manifest = root / "manifest.csv"
    if not manifest.exists():
        return {}
    rows = list(csv.DictReader(manifest.open(encoding="utf-8")))
    subsets = {}
    for threshold, name in threshold_pairs:
        target = root.parent / f"{root.name}_{name}"
        prepare_output(target)
        picked = 0
        for row in rows:
            area = float(row["median_area"])
            if (name == "near" and area <= threshold) or (name == "far" and area >= threshold):
                continue
            src_img = root / "images" / row["file"]
            stem = Path(row["file"]).stem
            dst_img = target / "images" / row["file"]
            dst_lbl = target / "labels" / f"{stem}.txt"
            if dst_img.is_file() and dst_lbl.is_file():
                picked += 1   # 上一轮已经链好，直接复用
                continue
            try:
                os.link(src_img, dst_img)
                os.link(root / "labels" / f"{stem}.txt", dst_lbl)
                picked += 1
            except OSError:
                shutil.copy2(src_img, dst_img)
                shutil.copy2(root / "labels" / f"{stem}.txt", dst_lbl)
                picked += 1
        (target / "data.yaml").write_text(
            f"path: {target.as_posix()}\ntrain: images\nval: images\ntest: images\n"
            "nc: 3\nnames: ['bottle', 'chair', 'door']\n", encoding="utf-8")
        cache = target / "labels.cache"
        if cache.is_file():
            cache.unlink()
        (target / MARKER).write_text("由 evaluate.py 生成，可安全重建\n", encoding="utf-8")
        subsets[name] = {"path": target, "images": picked}
        print(f"  {tag} {name}: {picked} 图 -> {target.name}")
    return subsets


def main():
    results = {}
    print("[1/2] 准备近景 / 远景子集")
    subsets = area_subsets(CLEAN, "clean")
    sets = {"clean_full": CLEAN, "legacy_49": LEGACY}
    sets.update({f"clean_{k}": v["path"] for k, v in subsets.items()})
    print(f"[2/2] 评测 {list(sets)} × {list(WEIGHTS)}")
    for tag, root in sets.items():
        print(f"\n== {tag} ==")
        results[tag] = {"images": count_images(root)}
        for name, weight in WEIGHTS.items():
            ap = run(weight, root, "test", 0.001)
            op = run(weight, root, "test", 0.35)
            results[tag][name] = {"ap": ap, "at_conf_0.35": op}
            line = "  ".join(f"{cls} AP50={v['ap50']:.3f}" for cls, v in ap["per_class"].items())
            print(f"  {name}: mAP50 {ap['overall']['mAP50']:.4f}  mAP50-95 {ap['overall']['mAP50_95']:.4f}"
                  f"  | conf0.35 P {op['overall']['precision']:.3f} R {op['overall']['recall']:.3f}"
                  f" F1 {op['f1']:.3f}  | {line}")

    (OUT / "eval_results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果：{OUT / 'eval_results.json'}")


if __name__ == "__main__":
    main()
