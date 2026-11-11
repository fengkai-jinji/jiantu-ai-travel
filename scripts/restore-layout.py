from pathlib import Path
import re, shutil

# 本脚本已移入 scripts/，仓库根目录在上一层
root = Path(__file__).resolve().parent.parent
original = root.parent / '传智杯网页设计'
source = (original / 'framework.html').read_text(encoding='utf-8')
css = re.search(r'<style>(.*?)</style>', source, re.S)[1]
(root / 'src/styles.css').write_text(css, encoding='utf-8')
(root / 'public/assets').mkdir(parents=True, exist_ok=True)
for name in ['indoor.svg', 'outdoor.svg']:
    shutil.copy2(original / 'assets' / name, root / 'public/assets' / name)

def jsx(value):
    value = value.replace('class=', 'className=').replace('<br>', '<br/>')
    value = re.sub(r'<img ([^>]+)>', r'<img \1/>', value)
    for old, new in [('stroke-width','strokeWidth'),('stroke-dasharray','strokeDasharray'),('font-size','fontSize')]:
        value = value.replace(old+'=',new+'=')
    return value

drawing = re.search(r'function routeDrawing\(\)\{return `(.*?)`\}', source, re.S)[1]
home = re.search(r'function home\(\)\{return `(.*?)`\}', source, re.S)[1]
home = home[:home.index('${annotation')].replace('${routeDrawing()}', '{<RouteDrawing/>}')
home = home.replace('选择杯子、椅子或房门', '选择瓶／杯、椅子或房门')
(root / 'src/Home.tsx').write_text('function RouteDrawing(){return '+jsx(drawing)+'}\nexport default function Home(){return <>'+jsx(home)+'</>}\n', encoding='utf-8')
app = root / 'src/App.tsx'
text = app.read_text(encoding='utf-8')
start = text.index('function Home()')
end = text.index('function Heading', start)
text = text[:start] + text[end:]
text = "import Home from './Home';\n" + text
text = text.replace('<div className="page-heading"><p', '<div className="page-heading"><div><p').replace('<p>{text}</p></div>}', '<p>{text}</p></div></div>}')
text = text.replace('<header><a className="brand"', '<div className="frame-bar"><span>JIANTU / 见途 · AI 无障碍出行助手</span><span>室内识别已接入 · 出行与问答服务待接入</span></div><header><div className="header-inner"><a className="brand"')
text = text.replace('<span className="brand-mark">见</span><strong>见途<small>JIANTU</small></strong>', '<span className="brand-mark" aria-hidden="true">途</span><div><strong>见途</strong><small>JIANTU</small></div>')
text = text.replace('</button></header><main id="main"', '</button></div></header><main className="main" id="main"')
text = text.replace('<footer>', '<footer className="footer">').replace('<strong>见途 JIANTU</strong><span>让信息可理解，让帮助可获得。</span>', '<span>见途 · AI 无障碍出行助手</span><span>出行需求为主线 · 无障碍知识面向所有人</span>')
app.write_text(text, encoding='utf-8')
