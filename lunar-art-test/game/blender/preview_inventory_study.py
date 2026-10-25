"""Compose the rendered samples and real-size inventory slots. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets' / 'inventory-study'
OUT = ROOT / 'art-direction' / 'inventory-study.png'
FONTS = Path('/System/Library/Fonts')


def font(size):
    return ImageFont.truetype(str(FONTS / 'Supplemental' / 'Arial.ttf'), size)


def centered(draw, x, y, text, size, color):
    draw.text((x,y),text,font=font(size),fill=color,anchor='mt')


items = [('metal','METAL','Cast lunar alloy'),('crop','POTATOES','Colony-grown food'),
         ('chip','COMPUTE CHIP','Satellite electronics'),('artifact','ALIEN ARTIFACT','Ember-lit mineral shell')]
board = Image.new('RGBA',(1200,690),'#11171c')
d = ImageDraw.Draw(board)
d.text((36,28),'MARE',font=font(14),fill='#aab5b9')
d.text((36,52),'Inventory icon study',font=font(30),fill='#eeeede')
d.text((1164,38),'01 / FOUR MATERIAL FAMILIES',font=font(12),fill='#aab5b9',anchor='ra')
d.line((36,99,1164,99),fill='#334047',width=1)
renders = {}
for i,(key,title,subtitle) in enumerate(items):
    im = Image.open(ASSETS / (key+'.png')).convert('RGBA')
    alpha = im.getchannel('A')
    bbox = alpha.getbbox()
    assert bbox and min(bbox[:2]) > 5 and max(bbox[2:]) < 507, (key,bbox)
    assert alpha.getextrema() == (0,255), (key,alpha.getextrema())
    print(key,im.size,'RGBA alpha bounds',bbox)
    # Preserve the source PNG; also provide standard game-ready 256px exports.
    scaled = im.resize((256,256),Image.Resampling.LANCZOS)
    (ASSETS / '256').mkdir(exist_ok=True)
    scaled.save(ASSETS / '256' / (key+'.png'))
    renders[key] = im
    x = 36+i*288
    d.rounded_rectangle((x,123,x+264,450),radius=10,fill='#1b242b',outline='#303e46')
    d.text((x+16,139),f'0{i+1}',font=font(12),fill='#7d909a')
    board.alpha_composite(im.resize((248,248),Image.Resampling.LANCZOS),(x+8,158))
    centered(d,x+132,403,title,15,'#eeeede')
    centered(d,x+132,426,subtitle,12,'#9baab1')

d.text((36,481),'INVENTORY READABILITY',font=font(13),fill='#aab5b9')
for base,size,label in [(36,50,'50 px slots / desktop'),(636,40,'40 px slots / compact')]:
    d.text((base,514),label,font=font(14),fill='#eeeede')
    x0,y0 = base,546
    gap,pad = 5,5
    width = len(items)*size+(len(items)-1)*gap+pad*2
    d.rounded_rectangle((x0,y0,x0+width,y0+size+2*pad),radius=6,fill='#0e1216',outline='#3e494e')
    for i,(key,_,_) in enumerate(items):
        x,y = x0+pad+i*(size+gap),y0+pad
        d.rounded_rectangle((x,y,x+size-1,y+size-1),radius=4,fill='#1c2328',outline='#465057')
        # Match the actual hotbar's key/count corners with the icon underneath.
        icon_size = size-6
        board.alpha_composite(renders[key].resize((icon_size,icon_size),Image.Resampling.LANCZOS),(x+3,y+3))
        d.text((x+4,y+2),str(i+1),font=font(9),fill='#b1b9bc',stroke_width=1,stroke_fill='#1c2328')
        d.text((x+size-4,y+size-2),['54','12','3','1'][i],font=font(11),fill='#f2f2e9',anchor='rb',stroke_width=1,stroke_fill='#1c2328')
d.line((36,633,1164,633),fill='#334047')
d.text((36,651),'Shared camera + studio lighting  /  Transparent PNGs  /  Editable Blender models',font=font(13),fill='#9baab1')
d.text((1164,651),'512 px masters',font=font(13),fill='#9baab1',anchor='ra')
board.convert('RGB').save(OUT)
print('PREVIEW',OUT)
