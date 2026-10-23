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
items=[('metal','Metal'),('silicon','Silicon'),('crop','Potatoes'),('greens','Greens'),('soy','Soybeans'),
       ('tomato','Tomatoes'),('algae','Algae'),('wheat','Wheat'),('mushroom','Mushrooms'),('flour','Flour'),
       ('protein','Soy protein'),('meal','Hash browns'),('salad','Salad'),('bread','Bread'),('stew','Soy stew'),
       ('broth','Mushroom broth'),('algaecake','Algae cakes'),('pizza','Pizza'),('medkit','Medkit'),
       ('core','Processor core'),('frame','Satellite frame'),('wing','Solar wing'),
       ('chip','Compute chip'),('satellite','AI satellite'),('titanium','Titanium ore'),
       ('rareearth','Rare-earth crystal'),('artifact','Alien artifact'),
       ('heart','Heart of the Deep'),('goo','Black goo'),('flare','Flare')]
COLS=10; CARD=130; ROWS=-(-len(items)//COLS)

# Check coverage against the actual carried inventory, not the separate belt-item list.
defs=(ROOT/'defs.js').read_text().split('export const ITEM_INFO = Object.freeze({',1)[1].split('\n});',1)[0]
ids=re.findall(r'^  (\w+):',defs,re.M)
assert ids==[key for key,_ in items],(ids,items)

W=34*2+COLS*CARD+(COLS-1)*12; H=115+ROWS*(CARD+52)+20
board=Image.new('RGBA',(W,H),'#11171c')
d=ImageDraw.Draw(board)
d.text((34,25),'LUNAR FRONTIER / INVENTORY',font=font(14),fill='#aab5b9')
d.text((34,49),'The complete item set',font=font(28),fill='#eeeede')
d.text((W-34,43),f'{len(items)} BLENDER-RENDERED ICONS',font=font(12),fill='#aab5b9',anchor='ra')
d.line((34,94,W-34,94),fill='#334047')
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
    x=34+(i%COLS)*(CARD+12); y=115+(i//COLS)*(CARD+52)
    d.rounded_rectangle((x,y,x+CARD,y+CARD+40),radius=9,fill='#1b242b',outline='#303e46')
    d.text((x+10,y+10),str(i+1).zfill(2),font=font(11),fill='#7d909a')
    board.alpha_composite(im.resize((CARD-10,CARD-10),Image.Resampling.LANCZOS),(x+5,y+22))
    d.text((x+CARD//2,y+CARD+18),title,font=font(12),fill='#eeeede',anchor='mt')
    print(key,'verified 512/256 RGBA',bounds)

d.text((34,H-22),'Shared orthographic camera and studio lighting / Transparent PNGs / Editable Blender library',font=font(12),fill='#9baab1')
board.convert('RGB').save(OUT)
(ASSETS/'manifest.json').write_text(json.dumps({'sourceSize':512,'gameSize':256,'items':dict(items)},indent=2)+'\n')
print('PREVIEW',OUT)
