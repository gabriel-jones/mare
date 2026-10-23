"""Produce game-sized exports and the complete inventory review board (Pillow)."""
from pathlib import Path
import json
import re
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets/inventory'
OUT=ROOT/'art-direction/inventory-icons.png'
font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
font=lambda size:ImageFont.truetype(font_path,size)
items=[('metal','Metal'),('silicon','Silicon'),('crop','Potatoes'),('meal','Meal'),
       ('core','Processor core'),('frame','Satellite frame'),('wing','Solar wing'),
       ('chip','Compute chip'),('satellite','AI satellite'),('titanium','Titanium ore'),
       ('rareearth','Rare-earth crystal'),('artifact','Alien artifact'),
       ('heart','Heart of the Deep'),('flare','Flare')]

# Check coverage against the actual carried inventory, not the separate belt-item list.
defs=(ROOT/'defs.js').read_text().split('export const ITEM_INFO = Object.freeze({',1)[1].split('\n});',1)[0]
ids=re.findall(r'^  (\w+):',defs,re.M)
assert ids==[key for key,_ in items],(ids,items)

board=Image.new('RGBA',(1400,900),'#11171c')
d=ImageDraw.Draw(board)
d.text((34,25),'LUNAR FRONTIER / INVENTORY',font=font(14),fill='#aab5b9')
d.text((34,49),'The complete item set',font=font(28),fill='#eeeede')
d.text((1366,43),'14 BLENDER-RENDERED ICONS',font=font(12),fill='#aab5b9',anchor='ra')
d.line((34,94,1366,94),fill='#334047')
renders={}
(ASSETS/'256').mkdir(exist_ok=True)
for i,(key,title) in enumerate(items):
    im=Image.open(ASSETS/(key+'.png')).convert('RGBA')
    assert im.size==(512,512)
    alpha=im.getchannel('A'); bounds=alpha.getbbox()
    assert bounds and min(bounds[:2])>5 and max(bounds[2:])<507,(key,bounds)
    assert alpha.getextrema()==(0,255),(key,'missing alpha')
    im.resize((256,256),Image.Resampling.LANCZOS).save(ASSETS/'256'/(key+'.png'))
    renders[key]=im
    x=34+(i%7)*193; y=115+(i//7)*253
    d.rounded_rectangle((x,y,x+174,y+231),radius=9,fill='#1b242b',outline='#303e46')
    d.text((x+12,y+12),str(i+1).zfill(2),font=font(11),fill='#7d909a')
    board.alpha_composite(im.resize((168,168),Image.Resampling.LANCZOS),(x+3,y+33))
    d.text((x+87,y+204),title,font=font(13),fill='#eeeede',anchor='mt')
    print(key,'verified 512/256 RGBA',bounds)

for y,size,label in [(648,50,'50 px inventory slots'),(753,40,'40 px compact slots')]:
    d.text((34,y),label,font=font(13),fill='#aab5b9')
    y+=25
    width=14*size+13*5+10
    d.rounded_rectangle((34,y,34+width,y+size+10),radius=6,fill='#0e1216',outline='#3e494e')
    for i,(key,_) in enumerate(items):
        x=39+i*(size+5); sy=y+5
        d.rounded_rectangle((x,sy,x+size-1,sy+size-1),radius=4,fill='#1c2328',outline='#465057')
        board.alpha_composite(renders[key].resize((size-6,size-6),Image.Resampling.LANCZOS),(x+3,sy+3))
        if i<10:
            d.text((x+4,sy+2),str((i+1)%10),font=font(9),fill='#b1b9bc',stroke_width=1,stroke_fill='#1c2328')
        count=['54','24','12','3','1','4','2','3','1','8','5','2','1','6'][i]
        d.text((x+size-4,sy+size-2),count,font=font(11),fill='#f2f2e9',anchor='rb',stroke_width=1,stroke_fill='#1c2328')
d.line((34,859,1366,859),fill='#334047')
d.text((34,875),'Shared orthographic camera and studio lighting / Transparent PNGs / Editable Blender library',font=font(12),fill='#9baab1')
board.convert('RGB').save(OUT)
(ASSETS/'manifest.json').write_text(json.dumps({'sourceSize':512,'gameSize':256,'items':dict(items)},indent=2)+'\n')
print('PREVIEW',OUT)
