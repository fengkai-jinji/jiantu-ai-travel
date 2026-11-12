# -*- coding: utf-8 -*-
"""构建「未参与训练」的室内评测集（products_clean_test）。

问题：现有 valid/test 的 49+49 张是从成品图 488 张里随机切的，四个拍摄场次
（椅子+门、杯子+椅子、杯子+椅子+门、杯子+门）每个都同时出现在 train 和 test 里，
同一摆位的相邻照片横跨划分，指标必然偏高。

做法：不从成品图里切，改从**训练池没用到的公开数据**里取，
要求候选图与 products_v3/train 的任一图都不构成近重复（dHash 汉明距离 > 阈值）。

来源与类别映射（与 build_products_v3_dataset.py 保持一致，bottle=0 chair=1 door=2）：
  datasets/chair            chair.*(0) -> chair          （v3 只用了 500 张，余下全部可用）
  datasets/SDGP-Chair       Chair(0) -> chair, NotChair(1) 丢弃
  raw/Bottle.v1i.yolov8     Bottle(0) -> bottle
  raw/test2.v7-sgd.yolov8   bottle(0) -> bottle
door 没有可用留出样本：door_handle 未被使用的 887 张只剩 Handle-Door（训练时整类丢弃），
indoor 未被使用的 2013 张只剩 person/table。脚本会如实报出这一点，不硬凑。

产物落在数据集盘（不进仓库，图片量大）：
  datasets/products_clean_test/{images,labels} + data.yaml
  datasets/products_clean_test/manifest.csv（来源、原文件名、类别框数、框面积中位数）
"""
import csv
import hashlib
import random
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(r"F:/归档/数据集与标注/YOLOv8")
DS = ROOT / "datasets"
TRAIN_IMAGES = DS / "products_v3" / "train" / "images"
OUT = DS / "products_clean_test"
EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
CLS = {"bottle": 0, "chair": 1, "door": 2}
NEAR_DUP = 4      # 64 位 dHash 汉明距离 <= 4 视为近重复
SEED = 42
MARKER = ".jiantu_eval_build"   # 标记本目录由脚本生成，重建时才允许清空
SOURCES = [
    # (目录, 类别映射, 标签, 抽样上限 None=全取)
    (DS / "chair", {0: CLS["chair"]}, "chair", None),
    (DS / "raw" / "SDGP-Chair.v1i.yolov8", {0: CLS["chair"]}, "SDGP-Chair", None),
    (DS / "raw" / "Bottle.v1i.yolov8", {0: CLS["bottle"]}, "Bottle.v1i", None),
    # 瓶子两个公开集共 3355 张、1.5 万框，全取会把整体指标拉成「瓶子单项」，
    # 固定种子抽 400 张，比例更贴近实地拍摄
    (DS / "raw" / "test2.v7-sgd.yolov8", {0: CLS["bottle"]}, "test2.v7-sgd", 400),
    # 组员视频抽帧试点：与训练池 md5 不重叠的只剩十几张，是唯一带 door 的干净样本
    (DS / "team_video_pilot_20261025" / "train",
     {0: CLS["bottle"], 1: CLS["chair"], 2: CLS["door"]}, "pilot-train", None),
    (DS / "team_video_pilot_20261025" / "val",
     {0: CLS["bottle"], 1: CLS["chair"], 2: CLS["door"]}, "pilot-val", None),
]


def read_label(path):
    rows = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) >= 5:
            rows.append((int(float(parts[0])), [float(v) for v in parts[1:5]]))
    return rows


def dhash(path):
    # cv2.imread 在 Windows 上读不了含中文的路径，统一走 fromfile + imdecode
    buffer = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_GRAYSCALE) if buffer.size else None
    if image is None:
        return None
    small = cv2.resize(image, (9, 8), interpolation=cv2.INTER_AREA)
    return (small[:, 1:] > small[:, :-1]).flatten().astype(np.uint8)


def md5(path):
    h = hashlib.md5()
    with path.open("rb") as f:
        while block := f.read(1 << 20):
            h.update(block)
    return h.hexdigest()


def hamming_min(hash_row, train_hashes):
    """与训练池全部 dHash 的最小汉明距离（按位异或后数 1）。"""
    diff = train_hashes ^ hash_row
    return np.unpackbits(diff, axis=1).sum(axis=1).min()


def collect(root, keep_map):
    """遍历一个来源的所有 split，返回 [(图片, 重映射后的框)]。
    root 既可指数据集根（下辖 train/valid/test），也可直接指某个 split 目录。"""
    items = []
    splits = [root] if (root / "images").is_dir() else [root / s for s in ("train", "valid", "test")]
    for base in splits:
        idir, ldir = base / "images", base / "labels"
        if not idir.is_dir():
            continue
        for img in sorted(idir.iterdir()):
            if img.suffix.lower() not in EXTS:
                continue
            rows = read_label(ldir / f"{img.stem}.txt")
            kept = [(keep_map[c], box) for c, box in rows if c in keep_map]
            if kept:
                items.append((img, kept))
    return items


def prepare_output(path):
    """增量重建，不做整目录删除：带标记的目录直接复用，己方多余文件才逐个清理；
    没有标记说明是别人的目录，改名留档，绝不删。"""
    marker = path / MARKER
    if not path.exists():
        (path / "images").mkdir(parents=True)
        (path / "labels").mkdir(parents=True)
        return
    if not marker.is_file():
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup = path.parent / f"{path.name}_备份_{stamp}"
        path.rename(backup)
        print(f"  目录 {path.name} 没有本脚本的标记，已改名留档为 {backup.name}（不删除）")
        (path / "images").mkdir(parents=True)
        (path / "labels").mkdir(parents=True)
        return
    (path / "images").mkdir(parents=True, exist_ok=True)
    (path / "labels").mkdir(parents=True, exist_ok=True)


def main():
    print("[1/4] 读训练池 dHash")
    train_files = [p for p in TRAIN_IMAGES.iterdir() if p.suffix.lower() in EXTS]
    train_hashes, train_md5 = [], set()
    for p in train_files:
        row = dhash(p)
        if row is not None:
            train_hashes.append(row)
        train_md5.add(md5(p))
    train_hashes = np.array(train_hashes)
    print(f"  训练池 {len(train_files)} 张，dHash {train_hashes.shape}")

    print("[2/4] 收集候选并去重、去近重复")
    records, seen_md5, excluded = [], set(), []
    for root, keep_map, tag, quota in SOURCES:
        items = collect(root, keep_map)
        rng = random.Random(SEED + len(tag))
        rng.shuffle(items)
        if quota is not None:
            items = items[:quota]
        kept = dropped_dup = dropped_used = dropped_far = 0
        for img, rows in items:
            digest = md5(img)
            if digest in train_md5:
                dropped_used += 1
                excluded.append({"origin": str(img), "source": tag,
                                 "reason": "已在 products_v3 训练集内"})
                continue
            if digest in seen_md5:
                dropped_dup += 1
                excluded.append({"origin": str(img), "source": tag,
                                 "reason": "与本集合内已有图片字节相同"})
                continue
            row = dhash(img)
            if row is None:
                excluded.append({"origin": str(img), "source": tag, "reason": "图片无法解码"})
                continue
            if hamming_min(row, train_hashes) <= NEAR_DUP:
                dropped_far += 1
                excluded.append({"origin": str(img), "source": tag,
                                 "reason": f"与训练集近重复（dHash≤{NEAR_DUP}）"})
                continue
            seen_md5.add(digest)
            kept += 1
            areas = sorted((box[2] * box[3]) for _, box in rows)
            records.append({"source": tag, "path": img, "rows": rows,
                            "median_area": areas[len(areas) // 2],
                            "boxes": len(rows)})
        print(f"  {tag:14s} 候选 {len(items):5d} -> 留 {kept:5d}"
              f"（已入训练池 {dropped_used}，本集内重复 {dropped_dup}，近重复于训练 {dropped_far}）")

    print("[3/4] 落盘")
    prepare_output(OUT)
    per_class = Counter()
    rows_out = []
    for i, rec in enumerate(records):
        name = f"{rec['source'].replace('.', '_')}_{i:05d}{rec['path'].suffix.lower()}"
        shutil.copy2(rec["path"], OUT / "images" / name)
        (OUT / "labels" / f"{Path(name).stem}.txt").write_text(
            "".join(f"{c} {b[0]} {b[1]} {b[2]} {b[3]}\n" for c, b in rec["rows"]), encoding="utf-8")
        for c, _ in rec["rows"]:
            per_class[c] += 1
        rows_out.append({"file": name, "source": rec["source"], "origin": str(rec["path"]),
                         "boxes": rec["boxes"], "median_area": round(rec["median_area"], 5)})
    (OUT / "data.yaml").write_text(
        f"path: {OUT.as_posix()}\ntrain: images\nval: images\ntest: images\n"
        "nc: 3\nnames: ['bottle', 'chair', 'door']\n", encoding="utf-8")
    with (OUT / "manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "source", "origin", "boxes", "median_area"])
        writer.writeheader()
        writer.writerows(rows_out)
    # 被排除的图逐条记账：原文件一律留在原位，这里只记路径与原因，便于回查
    with (OUT / "excluded.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["origin", "source", "reason"])
        writer.writeheader()
        writer.writerows(excluded)
    marker = OUT / MARKER
    marker.write_text("本目录由 model-training/indoor/eval/build_clean_test.py 生成，可安全重建\n",
                      encoding="utf-8")
    # 清掉上一轮遗留：不在本轮清单里的图、对应标签、以及 ultralytics 的标签缓存
    keep = {row["file"] for row in rows_out}
    stems = {Path(name).stem for name in keep}
    for stale in list((OUT / "images").iterdir()):
        if stale.is_file() and stale.name not in keep:
            stale.unlink()
    for stale in list((OUT / "labels").glob("*.txt")):
        if stale.stem not in stems:
            stale.unlink()
    cache = OUT / "labels.cache"
    if cache.is_file():
        cache.unlink()   # 清单变了缓存就作废，留着会让 ultralytics 读到旧的图片数

    print("[4/4] 统计")
    print(f"  合计 {len(records)} 图")
    names = {0: "bottle", 1: "chair", 2: "door"}
    for cid in (0, 1, 2):
        print(f"  {names[cid]:7s} 框 {per_class[cid]}")
    areas = np.array([r["median_area"] for r in records])
    print(f"  框面积占比 中位数 {np.median(areas):.3f}  "
          f"近景(>0.15) {int((areas > 0.15).sum())} 远景(<0.05) {int((areas < 0.05).sum())}")
    print(f"  数据集：{OUT}")


if __name__ == "__main__":
    main()
