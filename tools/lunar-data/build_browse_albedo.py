"""Create browser textures from the local NASA CGI Moon Kit RGB map.

Keeps the original -180..180 longitude layout and source sRGB values.
No contrast stretch, generative content, or changes to the original TIFF.
"""
import argparse
import json
from pathlib import Path
from PIL import Image

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    Image.MAX_IMAGE_PIXELS = None
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    with Image.open(args.source) as source:
        if source.mode != 'RGB' or source.width != source.height * 2:
            raise ValueError('Expected 2:1 RGB equirectangular map')
        info = {'source': Path(args.source).name, 'sourceSize': list(source.size),
                'longitudeLayout': '-180..180; 0 degrees centered', 'latitudeLayout': 'north at top',
                'colorSpace': 'sRGB', 'sourceCredit': 'NASA GSFC / LRO / LROC',
                'sourceReference': 'https://svs.gsfc.nasa.gov/4720/', 'textures': []}
        for width in (2048, 4096, 8192):
            name = f'browse-{width}.webp'
            source.resize((width, width // 2), Image.Resampling.LANCZOS).save(out / name, 'WEBP', quality=94, method=4)
            info['textures'].append({'path': name, 'width': width, 'height': width // 2})
            print(name, (out / name).stat().st_size, flush=True)
        (out / 'browse-albedo.json').write_text(json.dumps(info, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
