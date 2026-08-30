# バッジ SVG を PNG にする

対象: `assets/obsidian-pi-badge.svg`（800×800、透過あり）

ImageMagick の内蔵 SVG エンジンはこのファイルのベジェ曲線と `transform` を正しく描けない。`-density` を変えても直らないので、**ImageMagick は使わない**。

## 1. resvg で PNG 化

```powershell
scoop install resvg
resvg --width 800 assets/obsidian-pi-badge.svg assets/obsidian-pi-badge.png
```

幅だけ変えれば出力サイズを変えられる。例: `--width 512`

## 2. pngquant で容量削減

```powershell
pngquant --quality=65-85 --speed 1 --strip --ext .png --force assets/obsidian-pi-badge.png
```

元ファイルを上書きする。別ファイルに出すときは `--output` を使う。
