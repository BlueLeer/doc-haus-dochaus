"""Local PaddleOCR bridge. Only --prepare may download model weights."""
import argparse
import contextlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "assets" / "paddleocr"
DETECTION = "PP-OCRv6_small_det"
RECOGNITION = "PP-OCRv6_small_rec"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--pages")
    args = parser.parse_args()
    os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
    with contextlib.redirect_stdout(sys.stderr):
        if args.prepare:
            import shutil
            from paddlex.inference.utils.official_models import official_models
            MODELS.mkdir(parents=True, exist_ok=True)
            for name in (DETECTION, RECOGNITION):
                shutil.copytree(official_models[name], MODELS / name, dirs_exist_ok=True)
        for name in (DETECTION, RECOGNITION):
            if not (MODELS / name / "inference.yml").is_file():
                raise RuntimeError("PaddleOCR 模型未安装，请运行 scripts/setup-paddle-ocr.sh")
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(
            text_detection_model_name=DETECTION,
            text_detection_model_dir=str(MODELS / DETECTION),
            text_recognition_model_name=RECOGNITION,
            text_recognition_model_dir=str(MODELS / RECOGNITION),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            enable_mkldnn=False,
            cpu_threads=4,
        )
        if args.prepare:
            return
        if not args.pages:
            raise ValueError("缺少页面列表")
        pages = []
        filenames = Path(args.pages).read_text().splitlines()
        for index, filename in enumerate(filenames):
            for result in ocr.predict(filename):
                pages.append("\n".join(result["rec_texts"]))
            print(json.dumps({"stage": "ocr", "completed": index + 1, "total": len(filenames)}), file=sys.__stdout__, flush=True)
    print(json.dumps({"text": "\n\n".join(pages)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
