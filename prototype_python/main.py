"""Prototype Python du Battle Royale. Moteur : Ursina (Python/Panda3D).
Les modèles réalistes créés dans Blender pourront remplacer les objets provisoires.
"""
from ursina import *
from ursina.prefabs.first_person_controller import FirstPersonController
import random

app = Ursina(title='Battle Royale 3D — prototype Python')
window.color = color.rgb(135, 190, 225)
window.fps_counter.enabled = True

# Lumière et ambiance
Sky(color=color.rgb(135, 190, 225))
DirectionalLight(y=20, z=10, shadows=True).look_at(Vec3(1, -2, -1))
AmbientLight(color=color.rgba(130, 140, 155, 0.55))

# Île provisoire : les assets Blender remplaceront ces éléments
island = Entity(model='plane', scale=(180, 1, 180), texture='white_cube', texture_scale=(35, 35), color=color.rgb(86, 130, 65), collider='box')
water = Entity(model='plane', y=-0.18, scale=(500, 1, 500), color=color.rgb(45, 130, 185))

# Quelques variations de terrain, visibles et franchissables
for i in range(22):
    x, z = random.uniform(-78, 78), random.uniform(-78, 78)
    hill = Entity(model='sphere', position=(x, -0.5, z), scale=(random.uniform(5, 13), random.uniform(1, 4), random.uniform(5, 13)), color=color.rgb(random.randint(80, 110), random.randint(115, 145), random.randint(65, 90)), collider='box')

# Arbres composés de plusieurs formes plutôt que de cubes
for i in range(115):
    x, z = random.uniform(-82, 82), random.uniform(-82, 82)
    # garder le centre du village plus dégagé
    if abs(x) < 17 and abs(z) < 17:
        continue
    trunk_h = random.uniform(2.4, 4.0)
    Entity(model='cylinder', position=(x, trunk_h/2, z), scale=(0.45, trunk_h, 0.45), color=color.rgb(105, 73, 45), collider='box')
    for j in range(3):
        Entity(model='sphere', position=(x+random.uniform(-0.35,0.35), trunk_h+0.4+j*0.65, z+random.uniform(-0.35,0.35)), scale=(random.uniform(1.5,2.2), random.uniform(1.3,2), random.uniform(1.5,2.2)), color=color.rgb(random.randint(35,60), random.randint(95,130), random.randint(35,60)))

# Village avec entrée libre et intérieur simple
house_positions = [(-10, 0, -12), (10, 0, -12), (-12, 0, 10), (12, 0, 10), (0, 0, 24)]
for idx, (hx, hy, hz) in enumerate(house_positions):
    Entity(model='cube', position=(hx, 2, hz), scale=(8, 4, 7), color=color.rgb(190, 170, 135))
    # façade et toit pentu simulé par deux pans inclinés
    Entity(model='cube', position=(hx, 4.45, hz), scale=(8.8, 0.35, 7.8), rotation=(0, 0, 0), color=color.rgb(105, 55, 42))
    # porte sombre devant chaque maison
    Entity(model='cube', position=(hx, 1.2, hz-3.56), scale=(1.25, 2.4, 0.12), color=color.rgb(75, 45, 30))
    # fenêtres
    for wx in (-2.4, 2.4):
        Entity(model='cube', position=(hx+wx, 2.45, hz-3.57), scale=(1.25, 1.05, 0.1), color=color.rgb(100, 185, 215))

# Routes
for pos, scale in [((0, 0.015, 0), (5, .04, 160)), ((0, .02, 0), (150, .04, 5))]:
    Entity(model='cube', position=pos, scale=scale, color=color.rgb(62, 65, 65))

# Coffres interactifs
coins = 0
chest_entities = []
for i, (x, z) in enumerate([(-6,-8),(7,-7),(-8,8),(9,13),(22,22)]):
    chest = Entity(model='cube', position=(x, 0.65, z), scale=(1.25, 0.9, 0.8), color=color.rgb(145, 83, 30), collider='box', name='coffre')
    Entity(parent=chest, model='cube', y=0.28, scale=(1.04, 0.12, 1.03), color=color.rgb(225, 174, 55))
    chest_entities.append(chest)

player = FirstPersonController(position=(0, 2, -30), speed=7, jump_height=2, gravity=1)
player.cursor.visible = True
player.health = 100

hud = Text(text='PV 100  |  Pièces 0', position=(-0.86, 0.45), scale=1.1, background=True)
help_text = Text(text='WASD : bouger  |  ESPACE : sauter  |  E : coffre  |  Échap : souris', position=(-0.86, 0.40), scale=0.8, background=True)
status = Text(text='', origin=(0,0), y=0.32, scale=1.3, background=True)

# Menus de démonstration
menu_open = None
panel = None

def close_panel():
    global panel, menu_open
    if panel:
        destroy(panel)
        panel = None
    menu_open = None

def open_panel(title, body):
    global panel, menu_open
    close_panel()
    menu_open = title
    panel = Entity(parent=camera.ui)
    Entity(parent=panel, model='quad', scale=(0.72, 0.48), color=color.rgba(20, 28, 38, 235))
    Text(parent=panel, text=title, y=0.16, origin=(0,0), scale=1.6)
    Text(parent=panel, text=body, y=0.035, origin=(0,0), scale=1.0)
    Button(parent=panel, text='FERMER', y=-0.16, scale=(0.22,0.07), color=color.rgb(65,110,80), on_click=close_panel)

Button(text='CASIER', position=(-0.78, 0.32), scale=(0.16,0.06), color=color.rgb(60,90,140), on_click=lambda: open_panel('CASIER', 'Tenue : Éclaireur\nLes skins Blender seront ajoutés ici.'))
Button(text='BOUTIQUE', position=(-0.59, 0.32), scale=(0.18,0.06), color=color.rgb(150,95,35), on_click=lambda: open_panel('BOUTIQUE', 'Objets de démonstration\nLes pièces et achats seront développés ensuite.'))
Button(text='DANSER', position=(-0.39, 0.32), scale=(0.15,0.06), color=color.rgb(115,60,145), on_click=lambda: open_panel('DANSE', 'Danse provisoire : le personnage fait un petit mouvement.'))

# Cibles d'entraînement
for x, z in [(-22, 5), (24, -3), (28, 18)]:
    Entity(model='sphere', position=(x, 1.4, z), scale=(1, 2, 1), color=color.rgb(170, 55, 45), collider='box')


def input(key):
    global coins
    if key == 'escape':
        mouse.locked = not mouse.locked
    if key == 'e' and not menu_open:
        nearest = None
        nearest_dist = 3.5
        for chest in chest_entities:
            if chest and chest.enabled:
                d = distance(player.position, chest.position)
                if d < nearest_dist:
                    nearest, nearest_dist = chest, d
        if nearest:
            destroy(nearest)
            chest_entities.remove(nearest)
            coins += 25
            hud.text = f'PV 100  |  Pièces {coins}'
            status.text = '+25 pièces !'
            invoke(setattr, status, 'text', '', delay=1.5)
    if key == 'space' and player.y < -20:
        player.position = (0, 3, -30)

app.run()
