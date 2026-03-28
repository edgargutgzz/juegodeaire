import Phaser from "phaser";

const SIDEWALK_Y  = 660;
const GROUND_Y    = SIDEWALK_Y - 70; // visual top of grass tile = 610
const LEVEL_WIDTH   = 15800;
const REFINERY_X    = 13000; // donde paran autos y fábricas

const TRANSITION_X  = 3200; // bosque → ciudad
const INDUSTRY_X    = 6400; // ciudad → ciudad+autos+industria

const PROJ_LOW  = GROUND_Y - 28;
const PROJ_MID  = GROUND_Y - 90;
const PROJ_HIGH = GROUND_Y - 155;



export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private wasButtonDown   = false;
  private wasDpadUp       = false;
  private briefingActive  = false;

  private invincible      = false;
  private isCrouching     = false;
  private levelComplete   = false;

  private jumpsAvailable  = 1;

  private goalX           = 0;
  private health          = 10;
  private difficultyMultiplier = 1;

  private healthBar!:     Phaser.GameObjects.Graphics;
  private criticalTween:  Phaser.Tweens.Tween | null = null;
  private smogOverlay!:   Phaser.GameObjects.Rectangle;
  private vignetteRect!:  Phaser.GameObjects.Rectangle;

  private bgTile!:          Phaser.GameObjects.TileSprite;
  private urbanSkyOverlay!: Phaser.GameObjects.Rectangle;
  private waveIndex         = 0;
  private carSpawnerStarted = false;
  private newsBannerShown   = false;
  private cutsceneActive    = false;
  private staticCarData:    { img: Phaser.GameObjects.Image; nextFire: number; heights: number[] }[] = [];
  private factoryData:      { x: number; topY: number; nextFire: number; fireDelay: number; ballCount: number; vyBoost: number }[] = [];
  private factoriesEnabled  = false;

  constructor() { super("GameScene"); }

  preload() {
    const character = this.registry.get("character") || "maleAdventurer";
    const otherMap: Record<string, string> = {
      malePerson:       "femalePerson",
      femalePerson:     "malePerson",
      maleAdventurer:   "femaleAdventurer",
      femaleAdventurer: "maleAdventurer",
    };
    const otherChar = otherMap[character] ?? "femalePerson";
    this.load.image("other_idle", `/assets/character/character_${otherChar}_idle.png`);

    this.load.image("char_idle", `/assets/character/character_${character}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${character}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${character}_fall.png`);
    this.load.image("char_duck", `/assets/character/character_${character}_duck.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${character}_walk${i}.png`);
    }

    this.load.image("bg_talltrees",   "/assets/bg/bg_talltrees.png");
    this.load.image("bg_mountains",   "/assets/bg/bg_mountains.png");
    this.load.image("tree02", "/assets/trees/tree02.png");
    this.load.image("tree10", "/assets/trees/tree10.png");
    this.load.image("tree11", "/assets/trees/tree11.png");
    this.load.image("bld_beige_front", "/assets/buildings/house_beige_front.png");
    this.load.image("bld_beige_side",  "/assets/buildings/house_beige_side.png");
    this.load.image("bld_grey_front",  "/assets/buildings/house_grey_front.png");
    this.load.image("bld_grey_side",   "/assets/buildings/house_grey_side.png");
    this.load.image("ground_top",     "/assets/ground/ground_top.png");
    this.load.image("ground_fill",    "/assets/ground/ground_fill.png");
    this.load.image("asphalt_top",    "/assets/ground/asphalt_top.png");
    this.load.image("asphalt_fill",   "/assets/ground/asphalt_fill.png");
    this.load.image("ptcl_spark1", "/assets/particles/spark_01.png");
    this.load.image("ptcl_spark2", "/assets/particles/spark_02.png");
    this.load.image("ptcl_spark3", "/assets/particles/spark_03.png");
    for (let i = 0; i <= 8; i++)
      this.load.image(`expl_${i}`, `/assets/particles/explosion/explosion0${i}.png`);

    for (const v of ["sedan","sedan_blue","bus","truck","van","suv","truck_trailer","truckdark"])
      this.load.image(`veh_${v}`, `/assets/vehicles/${v}.png`);
    this.load.audio("sfx_jump1",  "/assets/sfx/SoundJump1.wav");
    this.load.audio("sfx_jump2",  "/assets/sfx/SoundJump2.wav");
    this.load.audio("sfx_crouch", "/assets/sfx/sfx_dive.wav");
    this.load.audio("sfx_bomb",        "/assets/sfx/bomb.ogg");
    this.load.audio("sfx_chimney",     "/assets/sfx/silencer.wav");
    this.load.audio("sfx_car_exhaust", "/assets/sfx/sfx_car_exhaust.ogg");
    this.load.audio("sfx_hit_female",  "/assets/sfx/sfx_hit_female.ogg");
    this.load.audio("sfx_hit_male",    "/assets/sfx/sfx_hit_male.wav");
    this.load.audio("sfx_siren",       "/assets/sfx/siren.mp3");
    this.load.audio("danger_sequence", "/assets/sfx/danger_sequence.ogg");
    this.load.audio("sfx_typewriter",  "/assets/sfx/typewriter.wav");
    // this.load.audio("sfx_hit",        "/assets/sfx/SoundPlayerHit.wav");
    // this.load.audio("sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav");
    // this.load.audio("sfx_goal",       "/assets/sfx/SoundReachGoal.wav");
    // this.load.audio("sfx_gameover",   "/assets/sfx/SoundGameOver.wav");
    // this.load.audio("sfx_death", "/assets/sfx/game_over.wav");
  }

  create() {
    this.levelComplete        = false;
    this.invincible           = false;
    this.isCrouching          = false;
    this.health               = 10;
    this.jumpsAvailable       = 1;
    this.waveIndex            = 0;
    this.cutsceneActive       = false;
    this.newsBannerShown      = false;
    this.briefingActive       = false;

    this.sound.stopAll();

    this.difficultyMultiplier = this.registry.get("difficultyMultiplier") ?? 1;
    this.carSpawnerStarted    = false;
    this.staticCarData        = [];
    this.factoryData          = [];
    this.factoriesEnabled     = false;

    this.physics.world.setBounds(0, -800, LEVEL_WIDTH, 1520);

    this.buildWorld();
    this.projectiles = this.physics.add.group();
    // La refinería ocupa 1280px igual que BossScene
    const refineryX = LEVEL_WIDTH - 1280;
    this.drawRefineryBuilding(refineryX, GROUND_Y);
    // gate left edge = refineryX + FAC_X(140) + FAC_W/2(500) - gateW/2(80) = refineryX + 560
    const gateLeft = refineryX + 560;
    this.goalX = gateLeft - 40;
    this.createGoal(this.goalX);

    // ── Player ────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(200, GROUND_Y - 300, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.85);
    this.player.setDepth(5);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 88, false);
    body.setOffset(16, 40);

    if (!this.anims.exists("walk")) {
      this.anims.create({
        key: "walk",
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
        frameRate: 12, repeat: -1,
      });
    }

    this.physics.add.collider(this.player, this.platforms);

    // Muro invisible en el portón de la refinería
    const gateWall = this.physics.add.staticGroup();
    const wallTile = gateWall.create(this.goalX + 160, GROUND_Y - 100, "sidewalk") as Phaser.Physics.Arcade.Image;
    wallTile.setVisible(false).setDisplaySize(10, 200).refreshBody();
    this.physics.add.collider(this.player, gateWall);
    this.physics.add.overlap(this.player, this.projectiles, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      const damage = p.getData("damage") as number ?? 1;
      p.destroy();
      this.onHit(damage);
    });

    // ── Camera ────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, -800, LEVEL_WIDTH, 1520);
    this.cameras.main.startFollow(this.player, true, 0.15, 0);
    this.cameras.main.scrollY = 0;
    this.cameras.main.fadeOut(0, 0, 0, 0);
    this.time.delayedCall(1000, () => {
      this.sound.play("nature_sketch", { loop: true, volume: 0.6 });
      this.cameras.main.fadeIn(600, 0, 0, 0);
    });

    // ── Drop-in ───────────────────────────────────────────────────
    this.player.setVisible(false);
    this.levelComplete = true;
    const checkLanding = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.player.body!.blocked.down) {
          checkLanding.remove();
          this.player.setVisible(true);
          this.time.delayedCall(200, () => { this.levelComplete = false; });
        }
      },
    });

    // ── HUD ───────────────────────────────────────────────────────
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();



    // ── Smog overlay (thickens as health drops) ───────────────────
    this.smogOverlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x4466aa, 0,
    ).setScrollFactor(0).setDepth(9);

    // ── Hit vignette ──────────────────────────────────────────────
    this.vignetteRect = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0xff0000, 0,
    ).setScrollFactor(0).setDepth(11);

    // ── Input ─────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
  }

  update() {
    // Briefing dismiss via gamepad
    if (this.briefingActive && this._briefingDismiss && this._briefingInputEnabled?.()) {
      const btn = this.pad?.buttons[0]?.pressed || this.pad?.buttons[1]?.pressed;
      if (btn) { this._briefingDismiss(); return; }
    }

    if (this.levelComplete) return;

    // Parallax bosque
    this.bgTile.tilePositionX = this.cameras.main.scrollX * 0.2;
    // Cielo se vuelve gris al entrar a la ciudad
    const cityAlpha = Phaser.Math.Clamp((this.player.x - (TRANSITION_X + 600)) / 1200, 0, 0.6);
    this.urbanSkyOverlay.setAlpha(cityAlpha);

    // Noticiero al entrar a la ciudad
    if (!this.newsBannerShown && this.player.x >= TRANSITION_X + 1580) {
      this.newsBannerShown = true;
      this.showNewsBanner();
    }

    // Carros aparecen después de la primera fábrica
    if (!this.carSpawnerStarted && this.player.x >= 9000) {
      this.carSpawnerStarted = true;
      this.startCarSpawner();
    }

    const onGround   = this.player.body!.blocked.down;
    if (onGround) {
      this.jumpsAvailable = 1;
    }

    const leftStickX = this.pad?.leftStick.x ?? 0;
    const leftStickY = this.pad?.leftStick.y ?? 0;
    const buttonA    = this.pad?.isButtonDown(0) ?? false;
    const dpadUp     = (this.pad?.up ?? false) || leftStickY < -0.1;
    const buttonAJust = buttonA && !this.wasButtonDown;
    const dpadUpJust  = dpadUp && !this.wasDpadUp;
    this.wasButtonDown = buttonA;
    this.wasDpadUp     = dpadUp;
    const dpadLeft   = this.pad?.left  ?? false;
    const dpadRight  = this.pad?.right ?? false;

    const goLeft  = !this.cutsceneActive && (this.cursors.left.isDown  || leftStickX < -0.1 || dpadLeft);
    const goRight = !this.cutsceneActive && (this.cursors.right.isDown || leftStickX >  0.1 || dpadRight);
    const crouch  = !this.cutsceneActive && (this.cursors.down.isDown  || (this.pad?.down ?? false) || leftStickY > 0.1);
    const jump    = !this.cutsceneActive && (Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonAJust || dpadUpJust);

    // ── Crouch ────────────────────────────────────────────────────
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false);
      body.setOffset(16, 84);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false);
      body.setOffset(16, 40);
    }

    // ── Movement ──────────────────────────────────────────────────
    const MAX_SPEED = 220;
    const ACCEL     = 900;
    const DRAG      = 1200;
    if (goLeft) {
      this.player.setAccelerationX(-ACCEL);
      body.setDragX(0);
      this.player.setFlipX(true);
    } else if (goRight) {
      this.player.setAccelerationX(ACCEL);
      body.setDragX(0);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
      body.setDragX(DRAG);
    }
    const vx = this.player.body!.velocity.x;
    if (Math.abs(vx) > MAX_SPEED) this.player.setVelocityX(Math.sign(vx) * MAX_SPEED);

    if (jump && this.jumpsAvailable > 0 && !this.isCrouching) {
      this.player.setVelocityY(-520);
      this.sfx("sfx_jump2", 0.6);
      this.jumpsAvailable--;
    }


    if (this.player.x >= this.goalX) this.onLevelComplete();

    // ── Destroy off-screen projectiles ────────────────────────────
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -100 || p.x > LEVEL_WIDTH + 100 || p.y < -800) p.destroy();
    }

    // ── Factory turrets ───────────────────────────────────────────
    const now = this.time.now;
    if (this.factoriesEnabled) {
      for (const f of this.factoryData) {
        const dist = this.player.x - f.x;
        if (dist > -1200 && dist < 100 && now >= f.nextFire) {
          f.nextFire = now + f.fireDelay + Math.random() * 600;
          this.fireFactorySmoke(f.x, f.topY, f.ballCount, f.vyBoost);
        }
      }
    }

    // ── Static car turrets ────────────────────────────────────────
    for (const car of this.staticCarData) {
      if (!car.img.active) continue;
      const dist = this.player.x - car.img.x; // negative = player is left of car
      if (dist > -950 && dist < 150 && now >= car.nextFire) {
        car.nextFire = now + 2200 + Math.random() * 2000;
        this.fireCarTurret(car.img.x, car.heights);
        this.spawnCarExhaust(car.img.x + 30, car.img.y - 10);
      }
    }


    // ── Animation ─────────────────────────────────────────────────
    if (!onGround) {
      const goingUp = (this.player.body!.velocity.y ?? 0) < 0;
      this.player.anims.stop();
      this.player.setTexture(goingUp ? "char_jump" : "char_fall");
    } else if (this.isCrouching) {
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (goLeft || goRight) {
      if (!this.player.anims.isPlaying) this.player.play("walk");
    } else {
      this.player.anims.stop();
      this.player.setTexture("char_idle");
    }
  }


  // ── Particles ────────────────────────────────────────────────────




  // ── Spawn rate ramps up with distance ────────────────────────────

  private get progressFactor() {
    return Math.min(this.player.x / LEVEL_WIDTH, 1);
  }

  private get spawnDelay() {
    return Phaser.Math.Linear(2200, 600, this.progressFactor);
  }

  private get projSpeedMult() {
    return Phaser.Math.Linear(1.0, 2.2, this.progressFactor);
  }

  // ── World ─────────────────────────────────────────────────────────

  private buildWorld() {
    this.drawCityBackground();

    // ── Ground visuals ────────────────────────────────────────────
    const grassW   = TRANSITION_X;
    const asphaltW = LEVEL_WIDTH - TRANSITION_X;

    // Solid base fills
    this.add.rectangle(TRANSITION_X / 2, SIDEWALK_Y + 100, grassW, 200, 0xc8904c).setDepth(0);
    this.add.rectangle(TRANSITION_X + asphaltW / 2, SIDEWALK_Y + 100, asphaltW, 200, 0x8a9fa0).setDepth(0);

    // Ground fills
    this.add.tileSprite(0, SIDEWALK_Y - 2, grassW, 202, "ground_fill").setOrigin(0, 0).setDepth(1);
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y - 2, asphaltW, 202, "asphalt_fill").setOrigin(0, 0).setDepth(1);

    // Ground tops
    this.add.tileSprite(0, SIDEWALK_Y, grassW, 70, "ground_top").setOrigin(0, 1).setDepth(2);
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y, asphaltW, 70, "asphalt_top").setOrigin(0, 1).setDepth(2);


    // ── Líneas de carretera (zona ciudad) ─────────────────────────
    const roadG = this.add.graphics().setDepth(2);
    roadG.fillStyle(0xeebb00, 0.7);
    for (let x = TRANSITION_X; x < LEVEL_WIDTH; x += 120) {
      roadG.fillRect(x, SIDEWALK_Y + 4, 70, 6); // línea central
    }

    // ── Árboles zona bosque ───────────────────────────────────────
    // Pinos zona bosque
    const treeLayout: [string, number, number][] = [
      ["tree02", 120,  1.8],
      ["tree11", 480,  1.3],
      ["tree10", 700,  1.6],
      ["tree02", 820,  1.2],
      ["tree11", 1180, 1.7],
      ["tree10", 1550, 1.4],
      ["tree02", 1680, 1.9],
      ["tree11", 2020, 1.3],
      ["tree10", 2090, 1.6],
      ["tree02", 2480, 1.5],
      ["tree11", 2700, 1.8],
      ["tree10", 2810, 1.2],
    ];
    for (const [key, x, scale] of treeLayout) {
      this.add.image(x, GROUND_Y, key).setOrigin(0.5, 1).setScale(scale).setDepth(1);
    }


    // ── City buildings (tiled across full level) ──────────────────
    const sectionW = 3200;
    const refineryStartX = LEVEL_WIDTH - 1280;
    for (let sx = TRANSITION_X; sx < LEVEL_WIDTH; sx += sectionW) {
      this.buildCityscape(sx, GROUND_Y, refineryStartX - 900);
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    this.textures.addCanvas("sidewalk", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, GROUND_Y + 8, "sidewalk").setAlpha(0);
    }

    // this.placeStaticCars();
    this.placeFactories();
  }


  private buildCityscape(startX: number, groundY: number, maxX = Infinity) {
    const layout: [string, number, number][] = [
      ["bld_grey_side",   startX + 80,   1.6],
      ["bld_beige_front", startX + 320,  1.5],
      ["bld_grey_front",  startX + 540,  1.6],
      ["bld_beige_side",  startX + 780,  1.5],
      ["bld_grey_side",   startX + 1020, 1.6],
      ["bld_beige_front", startX + 1260, 1.5],
      ["bld_grey_front",  startX + 1480, 1.7],
      ["bld_beige_side",  startX + 1720, 1.5],
      ["bld_grey_side",   startX + 1960, 1.6],
      ["bld_beige_front", startX + 2200, 1.5],
      ["bld_grey_front",  startX + 2420, 1.6],
      ["bld_beige_side",  startX + 2660, 1.5],
      ["bld_grey_side",   startX + 2900, 1.6],
      ["bld_beige_front", startX + 3140, 1.5],
    ];

    for (const [key, x, scale] of layout) {
      if (x >= maxX) continue;
      this.add.image(x, groundY, key)
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(1);
    }
  }

  private drawCityBackground() {
    const W = this.scale.width;
    const H = this.scale.height;
    // Cielo azul base
    this.add.rectangle(W / 2, H / 2, W, H, 0x87ceeb)
      .setScrollFactor(0).setDepth(-3);
    // Fondo montañas
    this.bgTile = this.add.tileSprite(0, -110, W, H, "bg_mountains")
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-2);
    // Overlay cielo urbano (gris) — encima del bosque, se funde al entrar a la ciudad
    this.urbanSkyOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0xc47a2a)
      .setScrollFactor(0).setDepth(-1).setAlpha(0);
  }

  // ── Pollution spawner (speed ramps with distance) ─────────────────

  // [y, delay, isPM25?]
  private readonly WAVES: [number, number, boolean?][][] = [
    [[PROJ_LOW,  0]],
    [[PROJ_MID,  0]],
    [[PROJ_HIGH, 0]],
    [[PROJ_LOW,  0, true]],                                    // PM2.5 solo
    [[PROJ_LOW,  0],[PROJ_LOW,  300]],
    [[PROJ_MID,  0],[PROJ_HIGH, 300]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 250]],                   // PM2.5 + PM10
    [[PROJ_HIGH, 0],[PROJ_LOW,  200, true]],                  // mix
    [[PROJ_MID,  0],[PROJ_MID,  200],[PROJ_MID, 400]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 200, true],[PROJ_HIGH, 400]], // PM2.5 barrage
  ];

  // @ts-ignore — reserved for future use
  private startPollutionSpawner() {
    const scheduleNext = () => {
      this.time.addEvent({
        delay: this.spawnDelay,
        callback: () => {
          if (!this.levelComplete) {
            const wave = this.WAVES[this.waveIndex % this.WAVES.length];
            this.waveIndex++;
            for (const [y, delay, isPM25] of wave) {
              this.time.delayedCall(delay, () => {
                if (!this.levelComplete) {
                  // 30% chance: spawn as cloud cluster instead of single particle
                  if (Math.random() < 0.3) {
                    this.fireCloud(y, !!isPM25);
                  } else {
                    this.fireProjectile(y, !!isPM25);
                  }
                }
              });
            }
          }
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(2500, scheduleNext);
    // Separate spawner: particles falling diagonally from above
    this.startFallingSpawner();
  }

  private startFallingSpawner() {
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 2000;
      this.time.addEvent({
        delay,
        callback: () => {
          if (!this.levelComplete) this.fireFallingCloud();
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(4000, scheduleNext);
  }

  private fireCloud(targetY: number, isPM25: boolean) {
    const count = 3 + Math.floor(Math.random() * 3); // 3–5 particles
    for (let i = 0; i < count; i++) {
      const offsetX = i * 40 + (Math.random() * 20 - 10);
      const offsetY = Math.random() * 50 - 25;
      this.time.delayedCall(i * 80, () => {
        if (!this.levelComplete) this.fireProjectile(targetY + offsetY, isPM25, offsetX);
      });
    }
  }

  private fireFallingCloud() {
    const spawnX   = this.cameras.main.scrollX + 1200 + Math.random() * 300;
    const count    = 4 + Math.floor(Math.random() * 4); // 4–7 particles
    for (let i = 0; i < count; i++) {
      const offsetX = Math.random() * 80 - 40;
      const offsetY = Math.random() * 60 - 30;
      this.time.delayedCall(i * 120, () => {
        if (!this.levelComplete) this.fireDiagonal(spawnX + offsetX, -60 + offsetY);
      });
    }
  }

  private fireDiagonal(spawnX: number, spawnY: number) {
    const isPM25  = Math.random() < 0.6;
    const radius  = isPM25 ? 6 : 14;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const vx      = -(80 + Math.random() * 60) * this.projSpeedMult;
    const vy      = 60 + Math.random() * 50;

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(vx, vy);

    const floatAmp = isPM25 ? 25 : 15;
    const floatDur = 1600 + Math.random() * 600;
    this.tweens.add({
      targets: proj, y: `+=${floatAmp}`,
      duration: floatDur, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
    this.tweens.add({ targets: proj, angle: -360, duration: 1800, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  private fireProjectile(targetY: number, isPM25 = false, extraOffsetX = 0) {
    const spawnX  = this.cameras.main.scrollX + 1380 + extraOffsetX;
    const radius  = isPM25 ? 7 : 18;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const speedVariation = 0.8 + Math.random() * 0.4; // ±20%
    const baseSpd = isPM25 ? -180 : -150;
    const speed   = baseSpd * this.projSpeedMult * speedVariation;

    // Spawn con ligero offset vertical aleatorio
    const spawnY  = targetY + (Math.random() * 40 - 20);

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    // Oscilación vertical sinusoidal — flota en el aire
    const floatAmp      = isPM25 ? 35 : 22;
    const floatDuration = isPM25 ? (1800 + Math.random() * 600) : (2400 + Math.random() * 800);
    this.tweens.add({
      targets: proj, y: spawnY + floatAmp,
      duration: floatDuration, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });

    this.tweens.add({ targets: proj, angle: -360, duration: isPM25 ? 1200 : 2000, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Goal ─────────────────────────────────────────────────────────

  private createGoal(_x: number) {
    // No visual goal marker — level ends on position trigger
  }

  private drawRefineryBuilding(ox: number, groundY: number) {
    // Mismos valores que BossScene
    const FAC_X = ox + 140;
    const FAC_W = 1000;
    const FAC_H = 480;
    const FAC_Y = groundY - FAC_H;
    const STACKS = [
      { rx: 90,  w: 58, h: 300 },
      { rx: 255, w: 70, h: 360 },
      { rx: 600, w: 70, h: 330 },
      { rx: 780, w: 58, h: 280 },
    ];

    const g = this.add.graphics().setDepth(2);

    // ── Smokestacks ───────────────────────────────────────────────
    for (const s of STACKS) {
      const sx = FAC_X + s.rx;
      const sy = FAC_Y - s.h;
      g.fillStyle(0x151515, 1);
      g.fillRect(sx, sy, s.w, s.h + FAC_H * 0.4);
      g.fillStyle(0xcc2200, 1);
      g.fillRect(sx, sy + 20, s.w, 14);
      g.fillRect(sx, sy + s.h * 0.4, s.w, 14);
      g.fillStyle(0x0d0d0d, 1);
      g.fillRect(sx - 8, sy - 6, s.w + 16, 18);

      const light = this.add.ellipse(sx + s.w / 2, sy - 14, 18, 18, 0xff2200).setDepth(5);
      let on = true;
      this.time.addEvent({
        delay: 700 + Math.random() * 200, loop: true,
        callback: () => { on = !on; light.setAlpha(on ? 1 : 0.1); },
      });
    }

    // ── Main building ─────────────────────────────────────────────
    g.fillStyle(0x1c1c1c, 1);
    g.fillRect(FAC_X, FAC_Y, FAC_W, FAC_H);
    g.fillStyle(0x242424, 1);
    g.fillRect(FAC_X, FAC_Y, FAC_W, FAC_H * 0.35);
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(FAC_X, FAC_Y, 4, FAC_H);

    // ── Windows ───────────────────────────────────────────────────
    const winCols = 12, winRows = 6, winW = 44, winH = 30;
    const winPadX = (FAC_W - winCols * winW) / (winCols + 1);
    const winStartY = FAC_Y + 40;
    // Sign bounds — skip windows that overlap it
    const signX0 = FAC_X + FAC_W / 2 - 160;
    const signX1 = signX0 + 320;
    const signY0 = FAC_Y + 18;
    const signY1 = signY0 + 64;

    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < winCols; col++) {
        const wx = FAC_X + winPadX + col * (winW + winPadX);
        const wy = winStartY + row * (winH + 28);
        if (wy + winH > groundY - 60) continue;
        // Skip windows behind the sign
        if (wx < signX1 && wx + winW > signX0 && wy < signY1 && wy + winH > signY0) continue;
        // Skip windows overlapping the gate opening
        const gateX0 = FAC_X + FAC_W / 2 - 80;
        const gateX1 = gateX0 + 160;
        if (wx < gateX1 && wx + winW > gateX0 && wy + winH > groundY - 200) continue;
        const hash = (col * 7 + row * 13) % 10;
        if (hash < 6) {
          g.fillStyle(0xff8800, 0.15);
          g.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
          g.fillStyle(0xffaa44, 0.9);
          g.fillRect(wx, wy, winW, winH);
          g.fillStyle(0xffffff, 0.2);
          g.fillRect(wx, wy, winW, 6);
        } else {
          g.fillStyle(0x0a0a0a, 1);
          g.fillRect(wx, wy, winW, winH);
        }
      }
    }

    // ── Portón de entrada ─────────────────────────────────────────
    const gateW = 160, gateH = 200;
    const gateX = FAC_X + FAC_W / 2 - gateW / 2;
    const gateY = groundY - gateH;
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(gateX, gateY, gateW, gateH);
    g.fillStyle(0x1c1c1c, 1);
    g.fillRect(gateX + 10, gateY + 10, gateW - 20, gateH - 10);
    g.fillStyle(0x333333, 1);
    for (let bx = gateX + 18; bx < gateX + gateW - 10; bx += 22) {
      g.fillRect(bx, gateY + 10, 8, gateH - 10);
    }
    g.lineStyle(4, 0x444444, 1);
    g.strokeRect(gateX, gateY, gateW, gateH);

    // ── Letrero SMOG CORP ─────────────────────────────────────────
    const signW = 320, signH = 64;
    const signX = FAC_X + FAC_W / 2 - signW / 2;
    const signY = FAC_Y + 18;
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(signX, signY, signW, signH);
    g.fillStyle(0xcc2200, 1);
    g.fillRect(signX + 2, signY + 2, signW - 4, 3);
    g.fillRect(signX + 2, signY + signH - 5, signW - 4, 3);
    this.add.text(signX + signW / 2, signY + signH / 2, "CONTAMINANTES\nSA DE CV", {
      fontSize: "13px", fontFamily: "'Press Start 2P'", color: "#ff4400",
      align: "center", lineSpacing: 6,
    }).setOrigin(0.5).setDepth(3);

  }

  // ── Events ────────────────────────────────────────────────────────

  private onLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.cutsceneActive = true;

    // Monito se queda stuck en la puerta
    this.player.setVelocity(0, 0);
    this.player.anims.stop();
    this.player.setTexture("char_idle");
    this.player.setFlipX(false); // mirando hacia la puerta

    // Corta música del nivel, shake, arranca BossIntro
    this.sound.stopAll();
    this.cameras.main.shake(250, 0.008);
    this.sound.play("sfx_boss_enter", { volume: 0.9 });

    // Fade a negro rápido — BossIntro sigue sonando en BossScene
    this.time.delayedCall(600, () => {
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("BossScene"));
    });
  }

  private onHit(damage = 1) {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - damage * this.difficultyMultiplier);
    this.drawHealthBar();
    this.sfx("sfx_hit", 0.7);
    const character = this.registry.get("character") as string ?? "";
    const isFemale  = character.toLowerCase().includes("female");
    const hitKey = isFemale ? "sfx_hit_female" : "sfx_hit_male";
    if (this.cache.audio.exists(hitKey)) {
      const hitSfx = this.sound.add(hitKey, { volume: 0.8 });
      hitSfx.play({ seek: isFemale ? 0.3 : 0 });
      const cutoff = isFemale ? 1000 : 800;
      this.time.delayedCall(cutoff, () => { if (hitSfx.isPlaying) hitSfx.stop(); hitSfx.destroy(); });
    }
    this.player.setTint(0xff4444);
    this.tweens.add({
      targets: this.player, x: this.player.x - 6,
      duration: 50, yoyo: true, repeat: 3, ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.player, alpha: 0.2,
      duration: 80, yoyo: true, repeat: 1, ease: "Stepped",
      onComplete: () => this.player.setAlpha(1),
    });
    this.cameras.main.shake(220, 0.007);

    // Red vignette flash
    this.vignetteRect.setAlpha(0.45);
    this.tweens.add({ targets: this.vignetteRect, alpha: 0, duration: 500, ease: "Quad.Out" });

    // Smog thickens
    const smogAlpha = ((10 - this.health) / 10) * 0.38;
    this.smogOverlay.setAlpha(smogAlpha);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.sound.stopByKey("sfx_hit_female");
        this.sound.stopByKey("sfx_hit_male");
        this.scene.start("GameOverScene", { from: "GameScene" });
      });
      return;
    }

    this.time.delayedCall(800, () => {
      this.player.clearTint();
      this.invincible = false;
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────



  private sfx(key: string, volume = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }

  private _showBriefing() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.briefingActive = true;

    const character = this.registry.get("character") || "maleAdventurer";
    const difficulty = this.registry.get("difficulty") as "normal" | "dificil" ?? "normal";
    const isHard = difficulty === "dificil";
    const accentColor = isHard ? "#ff5533" : "#2ecc87";
    const accentInt   = isHard ? 0xff5533   : 0x2ecc87;

    // ── Overlay dimmer ────────────────────────────────────────────
    const dimmer = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(20);

    // ── Dialog box ────────────────────────────────────────────────
    const boxH    = H * 0.36;
    const boxY    = H - boxH * 0.5 - H * 0.04;
    const boxX    = W * 0.04;
    const boxW    = W * 0.92;

    const boxBg = this.add.rectangle(boxX + boxW / 2, boxY, boxW, boxH, 0x0a0a0a, 0.95)
      .setScrollFactor(0).setDepth(21);
    const boxBorder = this.add.graphics().setScrollFactor(0).setDepth(22);
    boxBorder.lineStyle(2, accentInt, 1);
    boxBorder.strokeRect(boxX, boxY - boxH / 2, boxW, boxH);

    // Accent top bar
    const accentBar = this.add.rectangle(boxX + boxW / 2, boxY - boxH / 2, boxW, 3, accentInt, 1)
      .setScrollFactor(0).setDepth(22);

    // ── Character portrait ────────────────────────────────────────
    const portraitSize = boxH * 0.78;
    const portraitX    = boxX + portraitSize * 0.56;
    const portraitY    = boxY;
    const portrait = this.add.image(portraitX, portraitY, "char_idle")
      .setScrollFactor(0).setDepth(23)
      .setScale(portraitSize / 128);

    // Portrait separator line
    const sepX = portraitX + portraitSize * 0.56;
    const lineGfx = this.add.graphics().setScrollFactor(0).setDepth(22);
    lineGfx.lineStyle(1, accentInt, 0.4);
    lineGfx.lineBetween(sepX, boxY - boxH / 2 + 10, sepX, boxY + boxH / 2 - 10);

    // ── Name label ────────────────────────────────────────────────
    const nameMap: Record<string, string> = {
      malePerson:       "HABITANTE",
      femalePerson:     "HABITANTE",
      maleAdventurer:   "AVENTURERO",
      femaleAdventurer: "AVENTURERA",
    };
    const nameLabel = this.add.text(portraitX, boxY + boxH / 2 - 18, nameMap[character] ?? "HABITANTE", {
      fontSize: "9px", fontFamily: "'Press Start 2P'",
      color: accentColor,
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(23);

    // ── Mission text ──────────────────────────────────────────────
    const textX    = sepX + W * 0.03;
    const textMaxW = boxX + boxW - textX - W * 0.03;
    const textY    = boxY - boxH / 2 + 18;

    const MISSION_LINES = [
      "MISION:",
      "",
      "EL SMOG CUBRE LA CIUDAD.",
      "CADA SEGUNDO QUE RESPIRAS",
      "TE ACERCA AL FIN.",
      "",
      "ESCAPA ANTES DE QUE",
      "SEA DEMASIADO TARDE.",
    ];

    const textObj = this.add.text(textX, textY, "", {
      fontSize: "13px", fontFamily: "'Press Start 2P'",
      color: "#cccccc",
      wordWrap: { width: textMaxW },
      lineSpacing: 6,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(23);

    // Typewriter
    const fullText = MISSION_LINES.join("\n");
    let charIdx = 0;
    const typeChar = () => {
      if (charIdx >= fullText.length) {
        showPrompt();
        return;
      }
      charIdx++;
      textObj.setText(fullText.slice(0, charIdx));
      this.time.delayedCall(38, typeChar);
    };
    this.time.delayedCall(200, typeChar);

    // ── Press to continue prompt ──────────────────────────────────
    const promptText = this.add.text(boxX + boxW - 10, boxY + boxH / 2 - 12, "PRESIONA PARA CONTINUAR", {
      fontSize: "9px", fontFamily: "'Press Start 2P'",
      color: accentColor,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(23).setAlpha(0);

    const showPrompt = () => {
      promptText.setAlpha(1);
      this.tweens.add({ targets: promptText, alpha: 0.2, duration: 700, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
      enableDismiss();
    };

    // ── Dismiss ───────────────────────────────────────────────────
    const dismiss = () => {
      if (!this.briefingActive) return;
      this.briefingActive = false;
      [dimmer, boxBg, boxBorder, accentBar, portrait, lineGfx, nameLabel, textObj, promptText].forEach(o => o.destroy());
      this.levelComplete = false;
    };

    let inputEnabled = false;
    const enableDismiss = () => {
      inputEnabled = true;
      this.input.keyboard!.once("keydown", () => { if (inputEnabled) dismiss(); });
    };

    // Gamepad dismiss handled in update via briefingActive flag
    this._briefingDismiss = dismiss;
    this._briefingInputEnabled = () => inputEnabled;

  }

  // Briefing dismiss hooks for update()
  private _briefingDismiss: (() => void) | null = null;
  private _briefingInputEnabled: (() => boolean) | null = null;

  private showOtherCharMessage() {
    const W = this.scale.width;
    const H = this.scale.height;

    const boxH = H * 0.30;
    const boxY = H - boxH * 0.5 - H * 0.04;
    const boxX = W * 0.04;
    const boxW = W * 0.92;
    const accent = 0xff5533;
    const _accentHex = "#ff5533";

    const dimmer = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(30).setAlpha(0);
    const boxBg = this.add.rectangle(boxX + boxW / 2, boxY, boxW, boxH, 0x0a0a0a, 0.96)
      .setScrollFactor(0).setDepth(31);
    const boxBorder = this.add.graphics().setScrollFactor(0).setDepth(32);
    boxBorder.lineStyle(2, accent, 1);
    boxBorder.strokeRect(boxX, boxY - boxH / 2, boxW, boxH);
    const accentBar = this.add.rectangle(boxX + boxW / 2, boxY - boxH / 2, boxW, 3, accent, 1)
      .setScrollFactor(0).setDepth(32);

    // Portrait del otro personaje
    const portraitSize = boxH * 0.75;
    const portraitX = boxX + portraitSize * 0.56;
    const portrait = this.add.image(portraitX, boxY - 20, "other_idle")
      .setScrollFactor(0).setDepth(33).setScale(portraitSize / 128);

    // Línea separadora
    const sepX = portraitX + portraitSize * 0.56;
    const lineG = this.add.graphics().setScrollFactor(0).setDepth(32);
    lineG.lineStyle(1, 0xff5533, 0.4);
    lineG.lineBetween(sepX, boxY - boxH / 2 + 10, sepX, boxY + boxH / 2 - 10);


    // Texto con typewriter
    const MESSAGE = [
      "¿DONDE ESTAS?",
      "",
      "EL AIRE ESTA MUY CONTAMINADO HOY.",
      "",
      "LLEGA A CASA CUANTO ANTES, AQUI TE ESPERO.",
      "",
      "¡TEN CUIDADO!",
    ];
    const textObj = this.add.text(sepX + W * 0.03, boxY - 65, "", {
      fontSize: "13px", fontFamily: "'Press Start 2P'",
      color: "#cccccc", wordWrap: { width: boxX + boxW - sepX - W * 0.06 }, lineSpacing: 6,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(33);


    // Fade in
    this.tweens.add({ targets: dimmer, alpha: 1, duration: 300 });

    // Typewriter
    const fullText = MESSAGE.join("\n");
    let i = 0;
    const typeSound = this.sound.add("sfx_typewriter", { loop: true, volume: 0.35 });
    const typeChar = () => {
      if (i >= fullText.length) {
        typeSound.stop();
        const dismiss = () => {
          this.sfx("sfx_select", 1.0);
          this.tweens.add({
            targets: [dimmer, boxBg, boxBorder, portrait, lineG, textObj],
            alpha: 0, duration: 500,
            onComplete: () => {
              [dimmer, boxBg, boxBorder, accentBar, portrait, lineG, textObj].forEach(o => o.destroy());
              this.cutsceneActive   = false;
              this.factoriesEnabled = true;
            },
          });
        };
        this.time.delayedCall(300, () => {
          this.input.keyboard!.once("keydown", dismiss);
          this.input.gamepad!.once("down", dismiss);
        });
        return;
      }
      const ch = fullText[i];
      if (ch !== "\n" && !typeSound.isPlaying) typeSound.play();
      if (ch === "\n") typeSound.stop();
      textObj.setText(fullText.slice(0, ++i));
      this.time.delayedCall(45, typeChar);
    };
    this.time.delayedCall(300, typeChar);
  }

  private showNewsBanner() {
    const W = this.scale.width;
    const H = this.scale.height;
    const _bannerY = H - 120;

    // Congelar player
    this.cutsceneActive = true;
    this.player.setAccelerationX(0);
    this.player.setVelocityX(0);
    this.player.anims.stop();
    this.player.setTexture("char_idle");

    // Animación de sorpresa: sacudida rápida izquierda-derecha
    this.tweens.add({
      targets: this.player,
      x: this.player.x - 8,
      duration: 60, yoyo: true, repeat: 5,
      ease: "Sine.easeInOut",
    });

    // Flash rojo + terremoto
    this.cameras.main.flash(180, 255, 0, 0);
    this.cameras.main.shake(600, 0.022);
    this.time.delayedCall(220, () => {
      this.cameras.main.flash(180, 255, 0, 0);
      this.cameras.main.shake(400, 0.015);
    });

    // Fade música anterior
    const music = this.sound.get("nature_sketch");
    if (music) this.tweens.add({ targets: music, volume: 0, duration: 800, onComplete: () => music.stop() });
    this.sfx("sfx_siren", 0.5);

    // ── Banner box (estilo dialog del juego) ─────────────────────
    const accent    = 0xff5533;
    const accentHex = "#ff5533";
    const boxH  = 120;
    const boxX  = 0;
    const boxW  = W;
    const boxY  = H - boxH / 2;

    const boxBg = this.add.rectangle(boxX + boxW / 2, boxY, boxW, boxH, 0x0a0a0a, 0.96)
      .setScrollFactor(0).setDepth(30).setAlpha(0);
    const boxBorder = this.add.graphics().setScrollFactor(0).setDepth(31).setAlpha(0);
    boxBorder.lineStyle(2, accent, 1);
    boxBorder.lineBetween(boxX, boxY - boxH / 2, boxX + boxW, boxY - boxH / 2);
    const accentBar = this.add.rectangle(boxX + boxW / 2, boxY - boxH / 2, boxW, 3, accent, 1)
      .setScrollFactor(0).setDepth(31).setAlpha(0);

    const titleLabel = this.add.text(boxX + 16, boxY - boxH / 2 + 24, "ALERTA POR CONTINGENCIA AMBIENTAL", {
      fontSize: "13px", fontFamily: "'Press Start 2P'", color: accentHex,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(32).setAlpha(0);

    // Separator line under title
    const sepLine = this.add.graphics().setScrollFactor(0).setDepth(31).setAlpha(0);
    sepLine.lineStyle(1, accent, 0.35);
    sepLine.lineBetween(boxX + 8, boxY - boxH / 2 + 44, boxX + boxW - 8, boxY - boxH / 2 + 44);

    // Scrolling ticker text — starts at right edge of box
    const tickerText = this.add.text(boxX + boxW, boxY + 20,
      "SE RECOMIENDA NO REALIZAR ACTIVIDADES AL AIRE LIBRE   •   PERMANEZCA EN INTERIORES", {
      fontSize: "13px", fontFamily: "'Press Start 2P'", color: "#ffffff",
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(32).setAlpha(0);

    // Fade in
    this.tweens.add({ targets: [boxBg, boxBorder, accentBar, titleLabel, sepLine, tickerText], alpha: 1, duration: 300 });

    // Ticker scrolling
    this.tweens.add({
      targets: tickerText,
      x: -tickerText.width - 20,
      duration: 18000,
      ease: "Linear",
    });

    // Fade out banner, sirena y liberar player
    this.time.delayedCall(9000, () => {
      this.tweens.add({
        targets: [boxBg, boxBorder, accentBar, titleLabel, sepLine, tickerText],
        alpha: 0, duration: 600,
        onComplete: () => [boxBg, boxBorder, accentBar, titleLabel, sepLine, tickerText].forEach(o => o.destroy()),
      });
      const siren = this.sound.get("sfx_siren");
      if (siren) this.tweens.add({ targets: siren, volume: 0, duration: 800, onComplete: () => siren.stop() });
      this.sound.play("danger_sequence", { loop: true, volume: 0.6 });
      this.time.delayedCall(600, () => this.showOtherCharMessage());
    });
  }

  private drawHealthBar() {
    this.healthBar.clear();

    // ── Pixel heart ───────────────────────────────────────────────
    const px = 5; // pixel size
    const hx = 16;
    const hy = 28;
    const heart = [
      [0,1,1,0,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0],
    ];

    // Drop shadow
    this.healthBar.fillStyle(0x550000, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c])
          this.healthBar.fillRect(hx + c * px + 2, hy + r * px + 2, px, px);

    // Main red
    this.healthBar.fillStyle(0xcc1111, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c])
          this.healthBar.fillRect(hx + c * px, hy + r * px, px, px);

    // Highlight pixels (top-left of each lobe)
    this.healthBar.fillStyle(0xff6666, 1);
    this.healthBar.fillRect(hx + 1 * px, hy + 0 * px, px, px);
    this.healthBar.fillRect(hx + 4 * px, hy + 0 * px, px, px);
    this.healthBar.fillStyle(0xffffff, 0.7);
    this.healthBar.fillRect(hx + 1 * px, hy + 0 * px, 3, 3);
    this.healthBar.fillRect(hx + 4 * px, hy + 0 * px, 3, 3);

    // ── Segmented bar ─────────────────────────────────────────────
    const segments  = 10;
    const heartW    = 7 * px;
    const barX      = hx + heartW + 18;
    const barH      = 22;
    const barW      = 230;
    const barY      = hy + (heart.length * px - barH) / 2;
    const border    = 3;
    const corner    = 5;          // outer corner cut (pixelated rounding)
    const ic        = corner - border; // inner corner cut = 2
    const segW      = barW / segments;

    // Segment colors based on health
    let hi: number, lo: number;
    if (this.health >= 7)      { hi = 0x44cc55; lo = 0x228833; }
    else if (this.health >= 4) { hi = 0xffbb00; lo = 0xcc7700; }
    else                       { hi = 0xee3311; lo = 0xaa1100; }

    // Outer border — pixelated rounded hollow outline
    const bx   = barX - border, by = barY - border, bw = barW + border * 2, bh = barH + border * 2;
    const step = corner - border; // = 2 (diagonal corner step)

    this.healthBar.fillStyle(0x000000, 1);
    this.healthBar.fillRect(bx + corner,          by,                    bw - corner * 2, border); // top
    this.healthBar.fillRect(bx + corner,          by + bh - border,      bw - corner * 2, border); // bottom
    this.healthBar.fillRect(bx,                   by + corner,           border, bh - corner * 2); // left
    this.healthBar.fillRect(bx + bw - border,     by + corner,           border, bh - corner * 2); // right
    // Corner step pieces
    this.healthBar.fillRect(bx + border,               by + border,               step, step); // top-left
    this.healthBar.fillRect(bx + bw - border - step,   by + border,               step, step); // top-right
    this.healthBar.fillRect(bx + border,               by + bh - border - step,   step, step); // bottom-left
    this.healthBar.fillRect(bx + bw - border - step,   by + bh - border - step,   step, step); // bottom-right

    // Filled segments — clip corners on first and last segment
    for (let i = 0; i < this.health; i++) {
      const sx    = barX + i * segW;
      const clipL = i === 0            ? ic : 0;
      const clipR = i === segments - 1 ? ic : 0;
      const adjW  = segW - clipL - clipR;

      // Top half (lighter) — corner strip + middle
      this.healthBar.fillStyle(hi, 1);
      this.healthBar.fillRect(sx + clipL, barY,        adjW, ic);            // corner strip
      this.healthBar.fillRect(sx,         barY + ic,   segW, barH / 2 - ic); // middle

      // Bottom half (darker) — middle + corner strip
      this.healthBar.fillStyle(lo, 1);
      this.healthBar.fillRect(sx,         barY + barH / 2,        segW, barH / 2 - ic); // middle
      this.healthBar.fillRect(sx + clipL, barY + barH - ic,       adjW, ic);            // corner strip
    }

    // Segment dividers
    this.healthBar.fillStyle(0x000000, 1);
    for (let i = 1; i < segments; i++) {
      this.healthBar.fillRect(barX + i * segW - 1, barY, 2, barH);
    }


    // ── Blink on critical ─────────────────────────────────────────
    if (this.health <= 2 && !this.criticalTween) {
      this.criticalTween = this.tweens.add({
        targets: this.healthBar, alpha: 0.25,
        duration: 300, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
      });
    } else if (this.health > 2 && this.criticalTween) {
      this.criticalTween.stop();
      this.criticalTween = null;
      this.healthBar.setAlpha(1);
    }
  }

  // ── Zona 3: industria ─────────────────────────────────────────────

  private _buildIndustrialBackground() {
    // chimneys removed
  }

  private startCarSpawner() {
    const CAR_KEYS = [
      { key: "veh_sedan",         scale: 5.5, speed: 280 },
      { key: "veh_sedan_blue",    scale: 5.5, speed: 260 },
      { key: "veh_suv",           scale: 5.5, speed: 240 },
      { key: "veh_van",           scale: 5.8, speed: 220 },
      { key: "veh_truck",         scale: 6.0, speed: 180 },
      { key: "veh_bus",           scale: 6.0, speed: 170 },
      { key: "veh_truckdark",     scale: 6.0, speed: 190 },
    ];

    const spawnCar = () => {
      if (this.levelComplete || this.player.x >= REFINERY_X) return;
      const def = CAR_KEYS[Math.floor(Math.random() * CAR_KEYS.length)];
      // Spawn slightly off right edge of camera
      const spawnX = this.cameras.main.scrollX + this.scale.width + 100;
      // Dos carriles fijos: superior e inferior
      const LANE_TOP    = SIDEWALK_Y - 55; // carril de atrás
      const LANE_BOTTOM = SIDEWALK_Y - 18; // carril de enfrente
      const lane = Math.random() < 0.5 ? LANE_TOP : LANE_BOTTOM;
      const car = this.add.image(spawnX, lane, def.key)
        .setScale(def.scale)
        .setDepth(6) // delante del player (depth 5)
        .setFlipX(true); // facing left

      // Drive left
      this.tweens.add({
        targets: car,
        x: -200,
        duration: ((spawnX + 200) / def.speed) * 1000,
        ease: "Linear",
        onComplete: () => car.destroy(),
      });

      // Exhaust burst every ~2s — 3 puffs en columna ascendente
      const exhaustTimer = this.time.addEvent({
        delay: 1800 + Math.random() * 800,
        loop: true,
        callback: () => {
          if (!car.active || this.levelComplete) { exhaustTimer.remove(); return; }
          const exhaustX = car.x + (def.key.includes("truck") ? 65 : 35);
          // this.sfx("sfx_car_exhaust", 0.4);
          for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 120, () => {
              if (!car.active || this.levelComplete) return;
              this.spawnCarExhaust(exhaustX + (Math.random() * 10 - 5), car.y - 8);
            });
          }
        },
      });

      // Next car — más frecuente conforme avanza el jugador
      const progress   = Phaser.Math.Clamp((this.player.x - 9000) / 4000, 0, 1);
      const nextDelay  = Phaser.Math.Linear(8000, 2000, progress) + Math.random() * 1000;
      this.time.delayedCall(nextDelay, spawnCar);
    };

    // Arranca con 1 solo carro, los siguientes se encadenan solos con delay creciente
    this.time.delayedCall(1200, spawnCar);
  }

  private _placeStaticCars() {
    const carDefs = [
      { key: "veh_sedan",      scale: 3.2, yOff: 30 },
      { key: "veh_sedan_blue", scale: 3.2, yOff: 30 },
      { key: "veh_suv",        scale: 3.2, yOff: 32 },
      { key: "veh_van",        scale: 3.5, yOff: 35 },
      { key: "veh_bus",        scale: 3.8, yOff: 38 },
      { key: "veh_truck",      scale: 3.8, yOff: 38 },
      { key: "veh_truckdark",  scale: 3.8, yOff: 38 },
    ];

    const heightSets = [
      [PROJ_LOW],
      [PROJ_MID],
      [PROJ_LOW, PROJ_MID],
      [PROJ_HIGH, PROJ_LOW],
      [PROJ_MID, PROJ_HIGH],
    ];

    const positions = [
      TRANSITION_X + 300,
      TRANSITION_X + 900,
      TRANSITION_X + 1500,
      TRANSITION_X + 2200,
      TRANSITION_X + 2900,
      INDUSTRY_X + 400,
      INDUSTRY_X + 1000,
      INDUSTRY_X + 1600,
      INDUSTRY_X + 2200,
      INDUSTRY_X + 2800,
    ];

    for (const x of positions) {
      const def = carDefs[Math.floor(Math.random() * carDefs.length)];
      const img = this.add.image(x, SIDEWALK_Y - def.yOff, def.key)
        .setScale(def.scale)
        .setDepth(3)
        .setFlipX(true);
      const heights = heightSets[Math.floor(Math.random() * heightSets.length)];
      this.staticCarData.push({
        img,
        nextFire: this.time.now + 1500 + Math.random() * 3000,
        heights,
      });
    }
  }

  private fireCarTurret(carX: number, heights: number[]) {
    for (let i = 0; i < heights.length; i++) {
      this.time.delayedCall(i * 220, () => {
        if (this.levelComplete) return;
        this.fireCarProjectile(carX - 20, heights[i]);
      });
    }
  }

  private fireCarProjectile(spawnX: number, targetY: number) {
    const isPM25  = Math.random() < 0.4;
    const radius  = isPM25 ? 7 : 15;
    const color   = isPM25 ? 0x999999 : 0xbbbbbb;
    const damage  = isPM25 ? 3 : 1;
    const speed   = -(130 + Math.random() * 60) * this.projSpeedMult;
    const spawnY  = targetY + (Math.random() * 30 - 15);

    const key = `cproj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    const floatAmp = isPM25 ? 35 : 22;
    const floatDur = 1800 + Math.random() * 600;
    this.tweens.add({
      targets: proj, y: spawnY + floatAmp,
      duration: floatDur, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
    this.tweens.add({ targets: proj, angle: -360, duration: isPM25 ? 1200 : 2000, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Factories ─────────────────────────────────────────────────────

  private placeFactories() {
    // Progresión: 1 fábrica sola → carros se unen → más fábricas → más difícil
    // [x,     fireDelay, ballCount, vyBoost, scale]
    const factories: [number, number, number, number, number][] = [
      [6200,  5000, 4,  -0.3, 1.4], // 1ª — pequeña, introduce mechanic
      [7800,  3500, 4,   0.2, 1.3], // 2ª — normal
      [8200,  2000, 4,  -0.5, 1.6], // 3ª — grande
      [10500, 1600, 4,   0.0, 1.5], // 4ª — mediana
      [12000, 1200, 6,  -0.4, 1.8], // 5ª — muy grande, última
    ];
    for (let i = 0; i < factories.length; i++) {
      const [x, fireDelay, ballCount, vyBoost, scale] = factories[i];
      const stackTopY = this.drawFactory(x, GROUND_Y, "", scale);
      this.factoryData.push({
        x:         x + 30 * scale,
        topY:      stackTopY,
        nextFire:  this.time.now + 1500 + i * 800,
        fireDelay,
        ballCount,
        vyBoost,
      });
    }
  }


  private drawFactory(x: number, groundY: number, _name: string, scale = 1.0): number {
    const g = this.add.graphics().setDepth(1);

    // ── Main building body ────────────────────────────────────────
    const bW = 220 * scale, bH = 170 * scale;
    const bX = x - bW / 2;
    const bY = groundY - bH;

    // Shadow
    g.fillStyle(0x000000, 0.12);
    g.fillRect(bX + 6, bY + 6, bW, bH);

    // Body
    g.fillStyle(0x4a5060, 1);
    g.fillRect(bX, bY, bW, bH);

    // Side panel darker
    g.fillStyle(0x383d4a, 1);
    g.fillRect(bX + bW * 0.65, bY, bW * 0.35, bH);

    // Roof trim
    g.fillStyle(0x5a6070, 1);
    g.fillRect(bX - 4, bY, bW + 8, 10 * scale);

    // Windows (orange glow — furnace light)
    const wW = 28 * scale, wH = 20 * scale;
    g.fillStyle(0xff9933, 0.9);
    g.fillRect(bX + 20 * scale, bY + 30 * scale, wW, wH);
    g.fillRect(bX + 62 * scale, bY + 30 * scale, wW, wH);
    g.fillRect(bX + 104 * scale, bY + 30 * scale, wW, wH);
    // Window frames
    g.fillStyle(0x2a2f38, 1);
    g.fillRect(bX + 20 * scale,  bY + 30 * scale, 2, wH);
    g.fillRect(bX + 62 * scale,  bY + 30 * scale, 2, wH);
    g.fillRect(bX + 104 * scale, bY + 30 * scale, 2, wH);

    // Door
    g.fillStyle(0x2a2f38, 1);
    g.fillRect(bX + bW / 2 - 16 * scale, groundY - 50 * scale, 32 * scale, 50 * scale);

    // ── Smokestack ────────────────────────────────────────────────
    const sX    = x + 30 * scale;
    const sW    = 22 * scale;
    const sH    = 90 * scale;
    const sTopY = bY - sH;

    // Stack body
    g.fillStyle(0x333340, 1);
    g.fillRect(sX - sW / 2, sTopY, sW, sH);
    // Dark stripe
    g.fillStyle(0x222230, 1);
    g.fillRect(sX - sW / 2 + sW * 0.6, sTopY, sW * 0.4, sH);
    // Rim
    g.fillStyle(0x555566, 1);
    g.fillRect(sX - sW / 2 - 4, sTopY - 8, sW + 8, 10);

    return sTopY - 8; // tope de la chimenea
  }

  private fireFactorySmoke(factoryX: number, stackTopY: number, ballCount: number, vyBoost: number) {
    this.sfx("sfx_chimney", 0.5);
    const half   = Math.floor(ballCount / 2);
    const spread = 50;
    const angles: number[] = [];
    for (let i = 0; i < half; i++) {
      const t = half > 1 ? i / (half - 1) : 0.5;
      angles.push(-150 + t * spread); // izquierda
    }
    for (let i = 0; i < half; i++) {
      const t = half > 1 ? i / (half - 1) : 0.5;
      angles.push(-80 + t * spread);  // derecha
    }
    const spd = (160 + Math.random() * 40) * this.projSpeedMult;
    for (const deg of angles) {
      const rad = Phaser.Math.DegToRad(deg);
      const vx  = Math.cos(rad) * spd;
      const vy  = Math.sin(rad) * spd * (1 + vyBoost); // vyBoost ajusta altura del arco
      this.spawnSmokeBall(factoryX, stackTopY, vx, vy);
    }
  }

  private spawnSmokeBall(spawnX: number, spawnY: number, vx?: number, vy?: number) {
    const isPM25 = Math.random() < 0.5;
    const radius = isPM25 ? 9 : 17;
    const color  = isPM25 ? 0x888899 : 0xaaaaaa;
    const damage = isPM25 ? 2 : 1;

    const key = `smoke_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(30).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 0.9);
    gfx.fillCircle(radius, radius, radius * 0.7);
    gfx.fillStyle(0xffffff, 0.22);
    gfx.fillCircle(radius * 0.55, radius * 0.45, radius * 0.3);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    // Gravedad activada — la bola sale horizontal y cae en arco
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);

    const finalVx = vx ?? -(140 + Math.random() * 50) * this.projSpeedMult;
    const finalVy = vy ?? -(30 + Math.random() * 30);
    proj.setVelocity(finalVx, finalVy);
    this.tweens.add({ targets: proj, angle: 360, duration: 2200 + Math.random() * 1000, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  private spawnCarExhaust(x: number, y: number) {
    const isPM25 = Math.random() < 0.5;
    const radius = isPM25 ? 8 : 14;
    const color  = isPM25 ? 0x777788 : 0x999999;
    const damage = isPM25 ? 2 : 1;

    const key = `exhaust_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(0x444455, 0.9);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 0.75);
    gfx.fillCircle(radius, radius, radius * 0.7);
    gfx.fillStyle(0xffffff, 0.15);
    gfx.fillCircle(radius * 0.5, radius * 0.4, radius * 0.3);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(x, y, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4).setAlpha(0.9);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    // Sube en columna: fuerte impulso vertical, pequeña deriva lateral aleatoria
    const vx = (Math.random() * 30 - 15);
    const vy = -(220 + Math.random() * 100);
    proj.setVelocity(vx, vy);

    // Fade out alto en el cielo
    this.tweens.add({
      targets: proj, alpha: 0,
      duration: 3200, ease: "Quad.In",
      onComplete: () => proj.destroy(),
    });
    this.tweens.add({ targets: proj, angle: 180, duration: 1200, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }
}
