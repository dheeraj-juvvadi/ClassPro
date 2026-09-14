import random


def vine_leaf(horizontal, vertical, angle, scale, seed):
    grain = random.Random(seed)
    silhouette = 'M0 0L-9-9-13-22-11-31-5-43 1-52 7-42 13-33 15-20 10-9Z'
    fragments = [
        f'<g transform="translate({horizontal} {vertical}) rotate({angle}) scale({scale})">',
        f'<path d="{silhouette}" fill="#8e8ac7" transform="translate(-1.8 1)"/>',
        f'<path d="{silhouette}" fill="#238c50"/>',
        '<path d="M0 0Q3-24 1-48" stroke="#c7a74b" stroke-width="1.2"/>',
        '<path d="M1-16L-7-26M2-27L9-35" stroke="#d3a539" stroke-width=".8"/>',
    ]
    for speck in range(9):
        horizontal_mark = grain.uniform(-6, 7)
        vertical_mark = grain.uniform(-35, -10)
        fragments.append(
            f'<path d="M{horizontal_mark:.1f} {vertical_mark:.1f}l1.5-1 .6 2-1.7.5Z" '
            f'fill="{grain.choice(["#191b19", "#dfaa36", "#8d91cf"])}" opacity=".7"/>'
        )
    fragments.append('</g>')
    return ''.join(fragments)


def botanical_vines(mobile=False):
    if mobile:
        curves = [
            'M-12 155C61 116 100 192 176 163S286 109 362 74',
            'M29 923C106 814 166 863 232 831S376 851 455 949',
        ]
        leaves = [
            (48, 144, -34, .53), (89, 158, 143, .48),
            (131, 171, -24, .61), (184, 160, 130, .49),
            (226, 140, -35, .59), (272, 115, 122, .51),
            (312, 97, -24, .49), (78, 869, -56, .7),
            (126, 849, 153, .65), (179, 846, -22, .72),
            (232, 831, 152, .57), (286, 832, 18, .68),
            (339, 855, 147, .64), (392, 891, 38, .72),
        ]
        width = 2.2
    else:
        curves = [
            'M221 70C323 77 341 173 448 149S622 109 684 161 783 193 807 113',
            'M1374 314C1214 365 1289 492 1197 553S1261 704 1158 797 1121 886 1158 957',
            'M267 877C430 828 518 938 696 908S972 871 1158 957',
        ]
        leaves = [
            (302, 105, -35, .75), (353, 143, 151, .66),
            (424, 153, -21, .8), (491, 139, 130, .69),
            (564, 132, -28, .71), (637, 139, 145, .72),
            (702, 173, 22, .73), (773, 172, 112, .58),
            (1287, 361, -72, .91), (1260, 421, 52, .81),
            (1246, 487, -75, .88), (1197, 553, 65, .8),
            (1212, 621, -68, .9), (1214, 686, 54, .79),
            (1187, 763, -64, .96), (1122, 841, 63, .87),
            (1130, 916, -62, .73), (431, 871, -32, .72),
            (531, 904, 148, .67), (650, 914, -22, .83),
            (802, 898, 143, .71), (961, 902, 16, .79),
            (1075, 933, 149, .72),
        ]
        width = 2.8
    fragments = ['<g id="botanical-vines" stroke-linecap="round" stroke-linejoin="round">']
    for curve in curves:
        fragments.append(f'<path d="{curve}" stroke="#8e8ac7" stroke-width="{width + .8}" opacity=".48" transform="translate(-.8 1)"/>')
        fragments.append(f'<path d="{curve}" stroke="#729451" stroke-width="{width}"/>')
        fragments.append(f'<path d="{curve}" stroke="#c5a34a" stroke-width=".65" opacity=".65"/>')
    for index, placement in enumerate(leaves):
        fragments.append(vine_leaf(*placement, seed=720 + index))
    fragments.append('</g>')
    return ''.join(fragments)
