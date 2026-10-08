#!/usr/bin/env python3
"""Original, static pixel art for Anon's Cats appearance. No dependencies."""
from collections import defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'public'
PALETTE = {
    'o': '#101426', 's': '#925f4d', 'c': '#d99265', 'h': '#efb57d',
    'l': '#ffdb9e', 'w': '#f2e3c1', 'p': '#ce8f99', 'n': '#493e55',
    'b': '#727fa9', 'd': '#485478', 'a': '#aebce1', 'e': '#e9bd77',
    'v': '#8997c3', 'g': '#6d9c96', 'j': '#a5c6a3', 'k': '#3e686e',
}

class Art:
    def __init__(self, width, height, title):
        self.width, self.height, self.title = width, height, title
        self.parts = []

    def rect(self, x, y, w, h, color):
        self.parts.append(f'<path fill="{color}" d="M{x} {y}h{w}v{h}h{-w}z"/>')

    def sprite(self, rows, x, y, scale=1, colors=None, flip=False):
        palette = PALETTE | (colors or {})
        paths = defaultdict(list)
        width = max(map(len, rows))
        for row, line in enumerate(rows):
            col = 0
            while col < len(line):
                code, end = line[col], col + 1
                while end < len(line) and line[end] == code:
                    end += 1
                if code in palette:
                    px = width - end if flip else col
                    length = end - col
                    paths[palette[code]].append(f'M{px} {row}h{length}v1h{-length}z')
                col = end
        self.parts.append(f'<g transform="translate({x} {y}) scale({scale})">')
        self.parts.extend(f'<path fill="{color}" d="{"".join(path)}"/>' for color, path in paths.items())
        self.parts.append('</g>')

    def save(self, name):
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.width} {self.height}" width="{self.width * 2}" height="{self.height * 2}" shape-rendering="crispEdges" role="img" aria-labelledby="title">',
               f'<title id="title">{self.title}</title>', *self.parts, '</svg>']
        (OUT / name).write_text('\n'.join(svg) + '\n')

# Every silhouette and facial detail is drawn on a one-unit pixel grid.
SITTING = [
    '     oo            oo       ',
    '     oso          oso       ',
    '     ohso        oshco      ',
    '     ohpsoooooooosplco      ',
    '     ohppcchhhhccpplco      ',
    '     ochhchlllhhchhco       ',
    '    oshhsshhhhlsshhlco      ',
    '    oshhlhhhhhhhhhlhco      ',
    '    ochhoohhhhhhoohlco      ',
    '    ochlowhhhhhlwohlco      ',
    '   oshhhoohhlhhhoohhlco     ',
    '   ochhlllllpllllllhhco     ',
    '    ochllllnonlllllhco      ',
    '     oschlllllllhhcso       ',
    '      oschhwwwlhhso         ',
    '       oshwwwwwhhco         ',
    '       oshwwwwwhhco         ',
    '      oschwwwwwhhhco        ',
    '      osshwwwwwhhhsco       ',
    '     osschwwwwwhhhcsco      ',
    '     oschhwwwwwhhhhcso      ',
    '    osschhwwwwwhhhhcsco     ',
    '    oschhhwwwwwhhhhhco      ',
    '    oschhhhwwwhhhhhcco  oo  ',
    '    oschhhhwwwhhhhcsco osco ',
    '    oschhchwwwhchhcsco ochco',
    '    oschhchwwwhchhcsco ochco',
    '    oschhchwwwhchhccscochhco',
    '    oschhchwwwhchhcccsclhco ',
    '    oschhchwwwhchhcccclhco  ',
    '   oschllchwwwlchhlhhhco    ',
    '   ochlllchwwwlchhllhco     ',
    '   ocnnlcchwwwhcnnlhco      ',
    '    ooooooooooooooooo       ',
]
SLEEPING = [
    '                 ooooooooooooo            ',
    '              ooosccchhhhhhhhcooo         ',
    '            oosccchhhhllllhhhhhhcsoo       ',
    '    oo     oschhhhhlllwwllllhhhhhccso      ',
    '   osso   oschhhhhhlllwwwwwlllhhhcccso     ',
    '  oshpso oschhhhsshhhllwwwwlllshhhcccso    ',
    '  ohpphsoochhhhssshhhlllwwwwllsshhhccco    ',
    '  ochhhchchhhhhhhhhhlllwwwwwllsshhhhccso   ',
    '  ochhhhcllhhhhhhhhhllwwwwwwllhhhhhhccso   ',
    ' ochhhhhhlllhhhsshhhhllwwwwllhhhhhhhccco   ',
    ' ochhonohlllhhhsshhhhhllllllhhhhhhhhccco   ',
    ' ochhhhhhllhplhhhhhhhhhhhccccccccchhhcco   ',
    ' ochhlllllhhnhhhhhhcccccssooooooooschhco   ',
    '  ochlllllhhhhhhhcccsssoo          ochhco  ',
    '   oschhlllwhhhhcccssso   oooooooooochhco  ',
    '    osscclwwwwhccssso  oosccchhhhhhhhlco   ',
    '      osclwwwlcsssso   ochllllllhhhhllco   ',
    '       oosssssssooo     oosccccccccsso     ',
    '         ooooooo          ooooooooo       ',
]
PLANT = [
    '             kk                ',
    '          kkkjjkk              ',
    '         kgjjjjjjk             ',
    '         kggjjjjjk             ',
    '          kggjjjk              ',
    '            kgk                ',
    '             kk    kkkk        ',
    '   kkkk      kk  kkjjjjk        ',
    '  kgjjjkk    kk kgjjjjjk        ',
    '  kggjjjjk   kk kggjjjk         ',
    '   kggjjjjk  kk  kggk          ',
    '    kggjjjk  kk kkk            ',
    '      kgggkk kk kk             ',
    '        kkkk kkkk              ',
    '           kkkkk               ',
    '             kk                ',
    '             kk                ',
    '        oooooooooooo           ',
    '       onpppppppppnno          ',
    '       onplpppppppnno          ',
    '        onpppppppnno           ',
    '        onppppppnnno           ',
    '        onppppppnnno           ',
    '         onppppnnno            ',
    '         onpppnnnno            ',
    '          oooooooo             ',
]

def shelf(a, x, y, w):
    a.rect(x, y, w, 2, '#6f6680')
    a.rect(x, y + 2, w, 3, '#393c59')
    a.rect(x + 6, y + 5, 3, 4, '#252c45')
    a.rect(x + w - 9, y + 5, 3, 4, '#252c45')
    a.rect(x + 3, y, w - 6, 1, '#a18c96')


def book(a, x, y, w, h, cover='#7785b0', label='#d7d2c7'):
    a.rect(x, y, w, h, '#101426')
    a.rect(x + 1, y + 1, w - 2, h - 2, cover)
    a.rect(x + 2, y + 2, 1, h - 4, '#ffffff30')
    a.rect(x + 3, y + 4, w - 5, 1, label)
    a.rect(x + 3, y + h - 5, w - 5, 1, label)
    if h > 18:
        a.rect(x + 4, y + 8, max(1, w - 7), 4, '#10142640')


def stack(a, x, y):
    for dy, dx, width, cover in [(0, 2, 38, '#6d9c96'), (6, 0, 43, '#ab7e8d'), (12, 3, 39, '#7785b0')]:
        a.rect(x + dx, y + dy, width, 6, '#101426')
        a.rect(x + dx + 1, y + dy + 1, width - 2, 4, cover)
        a.rect(x + dx + 5, y + dy + 2, width - 8, 2, '#dccdac')
        a.rect(x + dx + width - 7, y + dy + 2, 1, 2, '#ae8f78')


def star(a, x, y, color='#68617e'):
    a.rect(x + 1, y, 1, 3, color)
    a.rect(x, y + 1, 3, 1, color)


def window(a, x, y):
    # A small moonlit window, with individually stepped clouds.
    a.rect(x, y, 40, 44, '#242d4b')
    a.rect(x + 2, y + 2, 36, 40, '#343e62')
    a.rect(x + 4, y + 4, 32, 36, '#1d2646')
    a.rect(x + 25, y + 8, 6, 6, '#d0bd96')
    a.rect(x + 24, y + 9, 8, 4, '#d0bd96')
    a.rect(x + 27, y + 7, 5, 5, '#1d2646')
    a.rect(x + 7, y + 24, 11, 3, '#3d4869')
    a.rect(x + 10, y + 22, 5, 2, '#3d4869')
    a.rect(x + 23, y + 31, 11, 3, '#354363')
    a.rect(x + 19, y + 2, 2, 40, '#4b5676')
    a.rect(x + 2, y + 21, 36, 2, '#4b5676')
    a.rect(x - 2, y + 44, 44, 2, '#697091')
    star(a, x + 10, y + 10, '#8591b1')


def build():
    a = Art(560, 72, 'Pixel cats resting among books and leafy plants beneath a moonlit window')
    shelf(a, 10, 62, 148)
    book(a, 20, 36, 9, 26, '#727fa9')
    book(a, 30, 41, 8, 21, '#ad7c8b')
    book(a, 39, 32, 10, 30, '#547b7e')
    book(a, 50, 38, 8, 24, '#b29674')
    a.sprite(SITTING, 68, 28)
    a.sprite(PLANT, 120, 36)
    window(a, 234, 4)
    shelf(a, 211, 62, 104)
    stack(a, 218, 44)
    a.sprite(SLEEPING, 219, 25, colors={'c': '#717d9f', 'h': '#99a5c4', 'l': '#bdc5d8', 's': '#485478'})
    book(a, 277, 40, 8, 22, '#a98191')
    book(a, 286, 34, 10, 28, '#6c9791')
    shelf(a, 374, 62, 176)
    a.sprite(PLANT, 376, 23, 1.5)
    stack(a, 469, 44)
    a.sprite(SLEEPING, 468, 25)
    book(a, 524, 35, 10, 27, '#8c83ae')
    book(a, 535, 43, 7, 19, '#b29674')
    for x, y in [(22, 14), (171, 32), (326, 17), (432, 35), (537, 13)]:
        star(a, x, y)
    a.save('pixel-cats-desktop.svg')

    a = Art(196, 64, 'A ginger pixel cat and a sleeping blue cat with books and a plant')
    shelf(a, 3, 54, 190)
    book(a, 10, 33, 8, 21, '#8c83ae')
    book(a, 19, 28, 9, 26, '#6c9791')
    book(a, 29, 36, 7, 18, '#b29674')
    a.sprite(SITTING, 40, 20)
    a.sprite(PLANT, 81, 28)
    stack(a, 123, 36)
    a.sprite(SLEEPING, 124, 17, colors={'c': '#717d9f', 'h': '#99a5c4', 'l': '#bdc5d8', 's': '#485478'})
    book(a, 173, 31, 9, 23, '#ad7c8b')
    star(a, 12, 13)
    star(a, 87, 9)
    star(a, 176, 10)
    a.save('pixel-cats-mobile.svg')

if __name__ == '__main__':
    build()
