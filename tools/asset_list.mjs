// Liste des ressources réalistes utilisées par le jeu (toutes CC0 sauf la voiture en CC-BY 4.0).

// Poly Haven (https://polyhaven.com, CC0) : textures PBR photo-scannées. id -> résolution source
export const POLYHAVEN_TEXTURES = {
  coast_sand_01: '1k',
  aerial_rocks_02: '1k',
  asphalt_02: '1k',
  concrete_pavement: '1k',
  white_stucco: '1k',
  beige_wall_001: '1k',
  red_brick_03: '1k',
  yellow_plaster: '1k',
  clay_roof_tiles_02: '1k',
  grey_roof_tiles: '1k',
  laminate_floor_02: '1k',
  herringbone_parquet: '1k',
  floor_tiles_06: '1k',
  painted_plaster_wall: '1k',
  rough_wood: '1k',
  palm_tree_bark: '1k',
  concrete_wall_008: '1k',
  brick_wall_09: '1k',
  rectangular_facade_tiles: '1k',
  plastered_wall_02: '1k',
  painted_metal_shutter: '1k',
  mossy_rock: '1k',
  wood_planks_grey: '1k',
  denim_fabric: '1k',
  cotton_jersey: '1k',
  jersey_melange: '1k',
  fabric_leather_01: '1k',
};

// ambientCG (https://ambientcg.com, CC0)
export const AMBIENTCG_TEXTURES = ['Grass004', 'Ground037'];

// Ciel HDRI Poly Haven (CC0)
export const HDRI = 'kloofendal_48d_partly_cloudy_puresky';

// Modèles Poly Haven (CC0). simplify = ratio de triangles conservés, tex = taille max des textures.
export const POLYHAVEN_MODELS = {
  // Intérieurs
  sofa_02: { tex: 512 },
  ArmChair_01: { tex: 512 },
  CoffeeTable_01: { tex: 512, simplify: 0.5 },
  painted_wooden_chair_02: { tex: 512 },
  GothicBed_01: { tex: 512, simplify: 0.3, error: 0.01 },
  Television_01: { tex: 512 },
  wooden_bookshelf_worn: { tex: 512 },
  potted_plant_04: { tex: 512 },
  ClassicNightstand_01: { tex: 512 },
  // Rue / extérieur
  street_lamp_01: { tex: 512, simplify: 0.2, error: 0.02 },
  fire_hydrant: { tex: 512, simplify: 0.1, error: 0.02 },
  metal_trash_can: { tex: 512, simplify: 0.5 },
  Barrel_01: { tex: 512 },
  wooden_crate_01: { tex: 512 },
  concrete_road_barrier_02: { tex: 512, simplify: 0.1, error: 0.02 },
  wooden_picnic_table: { tex: 512, simplify: 0.5 },
  // Butin
  treasure_chest: { tex: 1024, simplify: 0.12, error: 0.01 },
  medical_box: { tex: 512 },
  ammo_box: { tex: 512 },
  service_pistol: { tex: 1024, simplify: 0.5 },
  // Nature
  rock_moss_set_01: { tex: 1024, simplify: 0.4 },
  shrub_03: { tex: 1024, simplify: 0.5 },
  shrub_04: { tex: 1024, simplify: 0.15 },
  fern_02: { tex: 512 },
  tree_stump_01: { tex: 512, simplify: 0.2, error: 0.03 },
};
