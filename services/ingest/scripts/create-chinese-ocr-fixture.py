"""Create a synthetic image-only Chinese PDF for the OCR regression suite."""
import argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser()
parser.add_argument("--font", default="/System/Library/Fonts/PingFang.ttc")
args = parser.parse_args()
page = Image.new("RGB", (2480, 3508), "white")
draw = ImageDraw.Draw(page)
font = ImageFont.truetype(args.font, 60)
lines = [
    "劳动合同（虚构测试材料）",
    "劳动者姓名：张三",
    "用人单位：重庆测试有限公司",
    "入职日期：2023年9月1日",
    "工作地点：重庆市渝中区",
    "每月基本工资8000元，绩效工资2000元。",
    "工资按月支付，实际发放情况需要核对。",
    "双方对解除劳动合同的原因存在争议。",
    "本材料仅用于中文扫描件识别测试。",
]
for index, text in enumerate(lines):
    draw.text((180, 200 + index * 130), text, font=font, fill="black")
target = Path(__file__).resolve().parent.parent / "src" / "fixtures" / "chinese-scanned.pdf"
page.save(target, "PDF", resolution=300)
print(target)
