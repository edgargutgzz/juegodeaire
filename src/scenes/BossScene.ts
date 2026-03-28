import Phaser from "phaser";

const W       = 1280;
const H       = 720;
const FLOOR_Y    = 590;  // igual que GROUND_Y en GameScene
const SIDEWALK_Y = 660;  // igual que GameScene, para los tiles de asfalto

// Factory geometry
const FAC_X = 140;
const FAC_W = 1000;
const FAC_H = 480;
const FAC_Y = FLOOR_Y - FAC_H;

const STACKS = [
  { rx: 90,  w: 58, h: 300 },
  { rx: 255, w: 70, h: 360 },
  { rx: 600, w: 70, h: 330 },
  { rx: 780, w: 58, h: 280 },
];

const BOSS_DURATION   = 60000;

type SmokeParticle = {
  img: Phaser.GameObjects.Ellipse;
  vx: number; vy: number;
  life: number; maxLife: number;
};

export class BossScene extends Phaser.Scene {
  private player!:    Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!:   Phaser.Types.Input.Keyboard.CursorKeys;
  private pad:        Phaser.Input.Gamepad.Gamepad | null = null;
  private wasButtonDown = false;
  private wasDpadUp     = false;

  private health        = 10;
  private invincible    = false;
  private isCrouching   = false;
  private jumpsAvailable = 1;
  private wasOnGround   = false;
  private levelComplete = false;

  private bossBarGfx!:  Phaser.GameObjects.Graphics;
  private healthBarGfx!: Phaser.GameObjects.Graphics;
  private vignetteRect!: Phaser.GameObjects.Rectangle;
  private smogOverlay!: Phaser.GameObjects.Rectangle;
  private warningLights: { gfx: Phaser.GameObjects.Ellipse; on: boolean }[] = [];
  private smokeParticles: SmokeParticle[] = [];
  private startTime = -1;

  private criticalTween: Phaser.Tweens.Tween | null = null;

  constructor() { super("BossScene"); }

  preload() {
    const sfxMap: [string, string][] = [
      ["sfx_jump",       "/assets/sfx/SoundJump2.wav"],
      ["sfx_land",       "/assets/sfx/SoundLand1.wav"],
      ["sfx_hit",        "/assets/sfx/SoundPlayerHit.wav"],
      ["sfx_hit_female", "/assets/sfx/sfx_hit_female.ogg"],
      ["sfx_hit_male",   "/assets/sfx/sfx_hit_male.wav"],
      ["sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav"],
      ["sfx_goal",       "/assets/sfx/SoundReachGoal.wav"],
      ["sfx_gameover",   "/assets/sfx/SoundGameOver.wav"],
      ["sfx_death",      "/assets/sfx/SoundDeath.wav"],
      ["boss_theme",     "/assets/sfx/BossMain.wav"],
    ];
    for (const [key, path] of sfxMap) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, path);
    }
    this.load.image("firstaid", "/assets/items/firstaid.png");
    if (!this.textures.exists("bg_mountains"))
      this.load.image("bg_mountains", "/assets/bg/bg_mountains.png");
    if (!this.textures.exists("asphalt_top"))
      this.load.image("asphalt_top",  "/assets/ground/asphalt_top.png");
    if (!this.textures.exists("asphalt_fill"))
      this.load.image("asphalt_fill", "/assets/ground/asphalt_fill.png");
    if (!this.textures.exists("ptcl_spark1")) {
      this.load.image("ptcl_spark1", "/assets/particles/spark_01.png");
      this.load.image("ptcl_spark2", "/assets/particles/spark_02.png");
      this.load.image("ptcl_spark3", "/assets/particles/spark_03.png");
    }
    if (!this.textures.exists("expl_0")) {
      for (let i = 0; i <= 8; i++)
        this.load.image(`expl_${i}`, `/assets/particles/explosion/explosion0${i}.png`);
    }
    const character = this.registry.get("character") || "maleAdventurer";
    if (!this.textures.exists("char_idle")) {
      this.load.image("char_idle", `/assets/character/character_${character}_idle.png`);
      this.load.image("char_jump", `/assets/character/character_${character}_jump.png`);
      this.load.image("char_fall", `/assets/character/character_${character}_fall.png`);
      this.load.image("char_duck", `/assets/character/character_${character}_duck.png`);
      for (let i = 0; i < 8; i++)
        this.load.image(`char_walk${i}`, `/assets/character/character_${character}_walk${i}.png`);
    }
  }

  create() {
    this.levelComplete   = false;
    this.health          = 10;
    this.invincible      = false;
    this.isCrouching     = false;
    this.jumpsAvailable  = 1;
    this.wasOnGround     = false;
    this.startTime       = -1; // set on first update tick
    this.smokeParticles  = [];
    this.warningLights   = [];
    this.criticalTween   = null;

    this.physics.world.gravity.y = 600;
    this.physics.world.setBounds(0, -400, W, H + 400);
    this.cameras.main.setBounds(0, 0, W, H);

    this.drawBackground();
    this.drawFactory();
    this.setupPlatform();
    this.setupHUD();

    // ── Player — starts high up, falls in ────────────────────────
    this.player = this.physics.add.sprite(W / 2, -380, "char_fall")
      .setScale(0.85).setDepth(10).setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(64, 88, false).setOffset(16, 20);

    if (!this.anims.exists("walk")) {
      this.anims.create({
        key: "walk",
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
        frameRate: 12, repeat: -1,
      });
    }

    this.physics.add.collider(this.player, this.platforms);
    this.projectiles = this.physics.add.group();
    this.physics.add.overlap(this.player, this.projectiles, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      p.destroy();
      this.onHit();
    });

    // ── Input ─────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => { this.pad = pad; });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);

    // ── Smoke (slow at first, intensifies on landing) ─────────────
    this.startSmoke();

    // ── Warning lights (fast panic blink during intro) ────────────
    this.time.addEvent({
      delay: 700, loop: true,
      callback: () => {
        for (const wl of this.warningLights) {
          wl.on = !wl.on;
          wl.gfx.setAlpha(wl.on ? 1 : 0.1);
        }
      },
    });

    // ── Dramatic intro sequence ───────────────────────────────────
    // this.sound.stopAll();
    this.runBossIntro();
  }

  private runBossIntro() {
    // Fade in from black
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // Factory rumble shake at fade-in
    this.time.delayedCall(600, () => {
      this.cameras.main.shake(400, 0.014);
    });

    // Second shake — factory "waking up"
    this.time.delayedCall(1100, () => {
      this.cameras.main.shake(300, 0.010);
      // Flash factory windows white
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xff6600, 0.25)
        .setScrollFactor(0).setDepth(35);
      this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });
    });

    // "WARNING" text slams in
    this.time.delayedCall(1400, () => {
      const warn = this.add.text(W / 2, H * 0.38, "⚠ PELIGRO ⚠", {
        fontSize: "28px", fontFamily: "'Press Start 2P'",
        color: "#ffcc00", stroke: "#000000", strokeThickness: 8,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setScale(2);
      this.tweens.add({
        targets: warn, scaleX: 1, scaleY: 1,
        duration: 200, ease: "Back.Out",
      });
      this.tweens.add({
        targets: warn, alpha: 0,
        duration: 300, delay: 900,
        onComplete: () => warn.destroy(),
      });
    });


    // Wait for player to land, then do landing effects + start game
    const checkLanding = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.player.body!.blocked.down) {
          checkLanding.remove();
          this.onBossIntroLand();
        }
      },
    });
  }

  private onBossIntroLand() {
    // Massive landing impact
    this.cameras.main.shake(700, 0.025);
    this.sfx("sfx_land", 0.9);

    // Shockwave ring expanding from feet
    const ring = this.add.graphics().setDepth(15);
    let ringRadius = 5;
    this.time.addEvent({
      delay: 16, repeat: 25,
      callback: () => {
        ring.clear();
        ringRadius += 14;
        ring.lineStyle(4 - ringRadius / 50, 0xffffff, 1 - ringRadius / 360);
        ring.strokeCircle(this.player.x, FLOOR_Y, ringRadius);
      },
      callbackScope: this,
    });
    this.time.delayedCall(500, () => { ring.destroy(); });

    // Dust clouds at feet
    for (let i = -2; i <= 2; i++) {
      const dust = this.add.ellipse(
        this.player.x + i * 28, FLOOR_Y,
        40, 20, 0x888888, 0.7,
      ).setDepth(14);
      this.tweens.add({
        targets: dust,
        x: dust.x + i * 40, y: dust.y - 40,
        alpha: 0, scaleX: 2.5, scaleY: 2.5,
        duration: 600, ease: "Quad.Out",
        onComplete: () => dust.destroy(),
      });
    }

    // White full-screen flash on impact
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.7)
      .setScrollFactor(0).setDepth(60);
    this.tweens.add({ targets: flash, alpha: 0, duration: 400, onComplete: () => flash.destroy() });

    // Music kicks in on landing
    this.time.delayedCall(200, () => {
      this.sound.stopAll();
      this.sound.play("boss_theme", { loop: true, volume: 0.7 });
    });

    // Release player control and start waves after 1.2s
    this.time.delayedCall(1200, () => {
      this.levelComplete = false;
      this.startWaves();
    });
  }

  update() {
    if (this.levelComplete) return;

    if (this.startTime < 0) this.startTime = this.time.now;

    const onGround = this.player.body!.blocked.down;
    if (onGround) {
      if (!this.wasOnGround) { /* sin sonido de aterrizaje */ }
      this.jumpsAvailable = 1;
    }
    this.wasOnGround = onGround;

    // ── Boss bar (time-based depletion) ───────────────────────────
    const elapsed    = this.time.now - this.startTime;
    const bossHealth = Math.max(0, 1 - elapsed / BOSS_DURATION);
    this.drawBossBar(bossHealth);
    if (bossHealth <= 0) { this.onBossDefeated(); return; }

    // ── Input ─────────────────────────────────────────────────────
    const lx      = this.pad?.leftStick.x ?? 0;
    const ly      = this.pad?.leftStick.y ?? 0;
    const buttonA = this.pad?.isButtonDown(0) ?? false;
    const dpadUp  = (this.pad?.up ?? false) || ly < -0.1;
    const buttonAJust = buttonA && !this.wasButtonDown;
    const dpadUpJust  = dpadUp && !this.wasDpadUp;
    this.wasButtonDown = buttonA;
    this.wasDpadUp     = dpadUp;

    const goLeft  = this.cursors.left.isDown  || lx < -0.1 || (this.pad?.left  ?? false);
    const goRight = this.cursors.right.isDown || lx >  0.1 || (this.pad?.right ?? false);
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false) || ly > 0.1;
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonAJust || dpadUpJust;

    // ── Crouch ────────────────────────────────────────────────────
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false).setOffset(16, 64);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false).setOffset(16, 20);
    }

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
      this.sfx("sfx_jump", 0.6);
      this.jumpsAvailable--;
    }

    // ── Cleanup projectiles ───────────────────────────────────────
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -120 || p.x > W + 120 || p.y > H + 120 || p.y < -400) p.destroy();
    }

    // ── Smoke drift ───────────────────────────────────────────────
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const s = this.smokeParticles[i];
      s.life--;
      s.img.x += s.vx;
      s.img.y += s.vy;
      s.vy    -= 0.07;
      s.img.setAlpha((s.life / s.maxLife) * 0.45);
      s.img.setScale(s.img.scaleX + 0.03);
      if (s.life <= 0) { s.img.destroy(); this.smokeParticles.splice(i, 1); }
    }

    // ── Animation ─────────────────────────────────────────────────
    if (!onGround) {
      this.player.anims.stop();
      this.player.setTexture((this.player.body!.velocity.y ?? 0) < 0 ? "char_jump" : "char_fall");
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

  // ── Background & factory ─────────────────────────────────────────

  private drawBackground() {
    // Mismo bg que GameScene (ciudad)
    this.add.rectangle(W / 2, H / 2, W, H, 0x87ceeb).setScrollFactor(0).setDepth(-3);
    this.add.tileSprite(0, -110, W, H, "bg_mountains")
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-2);
    this.add.rectangle(W / 2, FLOOR_Y / 2, W, FLOOR_Y, 0xc47a2a)
      .setScrollFactor(0).setDepth(-1).setAlpha(0.6);
    // Ground — mismo asfalto que GameScene
    this.add.rectangle(W / 2, SIDEWALK_Y + (H - SIDEWALK_Y) / 2, W, H - SIDEWALK_Y, 0x8a9fa0).setDepth(-4);
    this.add.tileSprite(0, SIDEWALK_Y - 2, W, H - SIDEWALK_Y + 2, "asphalt_fill").setOrigin(0, 0).setDepth(-3);
    this.add.tileSprite(0, SIDEWALK_Y, W, 70, "asphalt_top").setOrigin(0, 1).setDepth(-2);
  }

  private drawFactory() {
    const g = this.add.graphics().setDepth(1);

    // ── Smokestacks (behind main building) ────────────────────────
    for (const s of STACKS) {
      const sx = FAC_X + s.rx;
      const sy = FAC_Y - s.h;
      g.fillStyle(0x151515, 1);
      g.fillRect(sx, sy, s.w, s.h + FAC_H * 0.4);
      // Stack stripe
      g.fillStyle(0xcc2200, 1);
      g.fillRect(sx, sy + 20, s.w, 14);
      g.fillRect(sx, sy + s.h * 0.4, s.w, 14);
      // Stack cap
      g.fillStyle(0x0d0d0d, 1);
      g.fillRect(sx - 8, sy - 6, s.w + 16, 18);

      // Warning light
      const light = this.add.ellipse(sx + s.w / 2, sy - 14, 18, 18, 0xff2200).setDepth(5);
      this.warningLights.push({ gfx: light, on: true });
    }

    // ── Main factory building ─────────────────────────────────────
    // Body
    g.fillStyle(0x1c1c1c, 1);
    g.fillRect(FAC_X, FAC_Y, FAC_W, FAC_H);
    // Slightly lighter top section
    g.fillStyle(0x242424, 1);
    g.fillRect(FAC_X, FAC_Y, FAC_W, FAC_H * 0.35);
    // Left edge highlight
    g.fillStyle(0xffffff, 0.04);
    g.fillRect(FAC_X, FAC_Y, 4, FAC_H);

    // ── Windows ───────────────────────────────────────────────────
    const winCols = 12;
    const winRows = 6;
    const winW    = 44;
    const winH    = 30;
    const winPadX = (FAC_W - winCols * winW) / (winCols + 1);
    const winPadY = 28;
    const winStartY = FAC_Y + 40;

    // Sign bounds — skip windows that overlap it
    const signX0 = FAC_X + FAC_W / 2 - 160;
    const signX1 = signX0 + 320;
    const signY0 = FAC_Y + 18;
    const signY1 = signY0 + 64;

    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < winCols; col++) {
        const wx = FAC_X + winPadX + col * (winW + winPadX);
        const wy = winStartY + row * (winH + winPadY);
        if (wy + winH > FLOOR_Y - 60) continue; // skip bottom row near gate
        // Skip windows behind the sign
        if (wx < signX1 && wx + winW > signX0 && wy < signY1 && wy + winH > signY0) continue;
        // Skip windows overlapping the gate opening
        const gateX0 = FAC_X + FAC_W / 2 - 80;
        const gateX1 = gateX0 + 160;
        if (wx < gateX1 && wx + winW > gateX0 && wy + winH > FLOOR_Y - 200) continue;
        const hash = (col * 7 + row * 13) % 10;
        if (hash < 6) {
          // Lit window
          g.fillStyle(0xff8800, 0.15);
          g.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
          g.fillStyle(0xffaa44, 0.9);
          g.fillRect(wx, wy, winW, winH);
          g.fillStyle(0xffffff, 0.2);
          g.fillRect(wx, wy, winW, 6);
        } else {
          // Dark window
          g.fillStyle(0x0a0a0a, 1);
          g.fillRect(wx, wy, winW, winH);
          g.fillStyle(0x222222, 0.5);
          g.fillRect(wx, wy, winW, 4);
        }
      }
    }

    // ── Main entrance gate ────────────────────────────────────────
    const gateW = 160;
    const gateH = 200;
    const gateX = FAC_X + FAC_W / 2 - gateW / 2;
    const gateY = FLOOR_Y - gateH;
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(gateX, gateY, gateW, gateH);
    // Gate arch
    g.fillStyle(0x1c1c1c, 1);
    g.fillRect(gateX + 10, gateY + 10, gateW - 20, gateH - 10);
    // Gate bars
    g.fillStyle(0x333333, 1);
    for (let bx = gateX + 18; bx < gateX + gateW - 10; bx += 22) {
      g.fillRect(bx, gateY + 10, 8, gateH - 10);
    }
    // Gate frame
    g.lineStyle(4, 0x444444, 1);
    g.strokeRect(gateX, gateY, gateW, gateH);

    // ── "SMOG CORP" sign ─────────────────────────────────────────
    const signW = 320;
    const signH = 64;
    const signX = FAC_X + FAC_W / 2 - signW / 2;
    const signY = FAC_Y + 18;
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(signX, signY, signW, signH);
    g.fillStyle(0xcc2200, 1);
    g.fillRect(signX + 2, signY + 2, signW - 4, 3);
    g.fillRect(signX + 2, signY + signH - 5, signW - 4, 3);
    this.add.text(signX + signW / 2, signY + signH / 2, "CONTAMINANTES\nSA DE CV", {
      fontSize: "13px", fontFamily: "'Press Start 2P'",
      color: "#ff4400", align: "center", lineSpacing: 6,
    }).setOrigin(0.5).setDepth(3);

  }

  private setupPlatform() {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    if (!this.textures.exists("boss_floor")) this.textures.addCanvas("boss_floor", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < W; x += 64) {
      this.platforms.create(x + 32, FLOOR_Y + 8, "boss_floor").setAlpha(0);
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────

  private setupHUD() {

    this.bossBarGfx = this.add.graphics().setScrollFactor(0).setDepth(22);

    this.healthBarGfx = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.drawHealthBar();

    // Smog overlay
    this.smogOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x4466aa, 0)
      .setScrollFactor(0).setDepth(18);

    // Vignette
    this.vignetteRect = this.add.rectangle(W / 2, H / 2, W, H, 0xff0000, 0)
      .setScrollFactor(0).setDepth(25);
  }

  private drawBossBar(fraction: number) {
    const bw = W * 0.66;
    const bx = W / 2 - bw / 2;
    const by = 55;
    const bh = 14;
    this.bossBarGfx.clear();
    this.bossBarGfx.fillStyle(0x330000, 1);
    this.bossBarGfx.fillRect(bx, by, bw, bh);
    const color = fraction > 0.5 ? 0xff4400 : fraction > 0.25 ? 0xff8800 : 0xff0000;
    this.bossBarGfx.fillStyle(color, 1);
    this.bossBarGfx.fillRect(bx, by, bw * fraction, bh);
    this.bossBarGfx.lineStyle(1, 0x662200, 1);
    this.bossBarGfx.strokeRect(bx, by, bw, bh);
  }

  private drawHealthBar() {
    this.healthBarGfx.clear();

    // ── Vertical segmented bar ─────────────────────────────────────
    const segments = 10;
    const segH = 22, segW = 28;
    const barX = 16, barY = 30;
    const barW = segW, barH = segH * segments;
    const border = 3, corner = 5, ic = corner - border;

    let hi: number, lo: number;
    if (this.health >= 7)      { hi = 0x44cc55; lo = 0x228833; }
    else if (this.health >= 4) { hi = 0xffbb00; lo = 0xcc7700; }
    else                       { hi = 0xee3311; lo = 0xaa1100; }

    // Border outline
    const bx = barX - border, by = barY - border;
    const bw = barW + border * 2, bh = barH + border * 2;
    const step = corner - border;
    this.healthBarGfx.fillStyle(0x000000, 1);
    this.healthBarGfx.fillRect(bx + corner,       by,                  bw - corner * 2, border);
    this.healthBarGfx.fillRect(bx + corner,       by + bh - border,    bw - corner * 2, border);
    this.healthBarGfx.fillRect(bx,                by + corner,         border, bh - corner * 2);
    this.healthBarGfx.fillRect(bx + bw - border,  by + corner,         border, bh - corner * 2);
    this.healthBarGfx.fillRect(bx + border,             by + border,             step, step);
    this.healthBarGfx.fillRect(bx + bw - border - step, by + border,             step, step);
    this.healthBarGfx.fillRect(bx + border,             by + bh - border - step, step, step);
    this.healthBarGfx.fillRect(bx + bw - border - step, by + bh - border - step, step, step);

    // Segments drawn top→bottom, filled from top
    for (let i = 0; i < segments; i++) {
      const sy = barY + i * segH;
      const clipT = i === 0            ? ic : 0;
      const clipB = i === segments - 1 ? ic : 0;
      const adjH  = segH - clipT - clipB;
      if (i >= segments - this.health) {
        // Left half (lighter) — outer edge strip (clipped) + inner full-height area
        this.healthBarGfx.fillStyle(hi, 1);
        this.healthBarGfx.fillRect(barX,           sy + clipT, ic,            adjH); // outer strip, clipped
        this.healthBarGfx.fillRect(barX + ic,      sy,         barW / 2 - ic, segH); // inner, full height
        // Right half (darker) — inner full-height area + outer edge strip (clipped)
        this.healthBarGfx.fillStyle(lo, 1);
        this.healthBarGfx.fillRect(barX + barW / 2, sy,          barW / 2 - ic, segH); // inner, full height
        this.healthBarGfx.fillRect(barX + barW - ic, sy + clipT, ic,            adjH); // outer strip, clipped
      }
    }
    // Segment dividers
    this.healthBarGfx.fillStyle(0x000000, 1);
    for (let i = 1; i < segments; i++)
      this.healthBarGfx.fillRect(barX, barY + i * segH - 1, barW, 2);

    // ── Pixel heart (below the bar) ────────────────────────────────
    const px = 5;
    const hx = barX + barW / 2 - (7 * px) / 2;
    const hy = barY + barH + 10;
    const heart = [
      [0,1,1,0,1,1,0],
      [1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1],
      [0,1,1,1,1,1,0],
      [0,0,1,1,1,0,0],
      [0,0,0,1,0,0,0],
    ];
    this.healthBarGfx.fillStyle(0x550000, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c]) this.healthBarGfx.fillRect(hx + c * px + 2, hy + r * px + 2, px, px);
    this.healthBarGfx.fillStyle(0xcc1111, 1);
    for (let r = 0; r < heart.length; r++)
      for (let c = 0; c < heart[r].length; c++)
        if (heart[r][c]) this.healthBarGfx.fillRect(hx + c * px, hy + r * px, px, px);
    this.healthBarGfx.fillStyle(0xff6666, 1);
    this.healthBarGfx.fillRect(hx + 1 * px, hy, px, px);
    this.healthBarGfx.fillRect(hx + 4 * px, hy, px, px);
    this.healthBarGfx.fillStyle(0xffffff, 0.7);
    this.healthBarGfx.fillRect(hx + 1 * px, hy, 3, 3);
    this.healthBarGfx.fillRect(hx + 4 * px, hy, 3, 3);

    if (this.health <= 2 && !this.criticalTween) {
      this.criticalTween = this.tweens.add({
        targets: this.healthBarGfx, alpha: 0.25,
        duration: 300, ease: "Sine.easeInOut", yoyo: true, repeat: -1,
      });
    } else if (this.health > 2 && this.criticalTween) {
      this.criticalTween.stop();
      this.criticalTween = null;
      this.healthBarGfx.setAlpha(1);
    }
  }

  // ── Smoke ─────────────────────────────────────────────────────────

  private startSmoke() {
    const spawnSmoke = (stackIndex: number) => {
      const s  = STACKS[stackIndex];
      const sx = FAC_X + s.rx + s.w / 2;
      const sy = FAC_Y - s.h - 6;
      const maxLife = Phaser.Math.Between(80, 140);
      const img = this.add.ellipse(
        sx + Phaser.Math.Between(-8, 8),
        sy,
        Phaser.Math.Between(24, 40),
        Phaser.Math.Between(24, 40),
        0x554433,
      ).setAlpha(0.4).setDepth(8);
      this.smokeParticles.push({
        img, maxLife, life: maxLife,
        vx: Phaser.Math.FloatBetween(-0.4, 0.4),
        vy: Phaser.Math.FloatBetween(-1.2, -0.6),
      });
    };

    this.time.addEvent({
      delay: 180, loop: true,
      callback: () => {
        for (let i = 0; i < STACKS.length; i++) spawnSmoke(i);
      },
    });
  }

  // ── Attack waves ──────────────────────────────────────────────────

  private startWaves() {
    const LOW  = FLOOR_Y - 32;
    const MID  = FLOOR_Y - 100;
    const HIGH = FLOOR_Y - 168;

    const scheduleNext = () => {
      const elapsed  = this.time.now - this.startTime;
      const phase    = Math.min(3, Math.floor(elapsed / 15000));
      // Spawn interval shrinks per phase
      const interval = [2400, 1900, 1500, 1200][phase];

      this.time.delayedCall(interval, () => {
        if (this.levelComplete) return;
        this.doAttack(phase, LOW, MID, HIGH);
        scheduleNext();
      });
    };

    // Short intro pause before attacks start
    this.time.delayedCall(2400, scheduleNext);
  }

  private doAttack(phase: number, LOW: number, MID: number, HIGH: number) {
    const roll = Math.random();

    if (phase === 0) {
      // Phase 1: horizontal only
      if (roll < 0.5) this.fireHorizontal("left",  Phaser.Math.RND.pick([LOW, MID, HIGH]));
      else             this.fireHorizontal("right", Phaser.Math.RND.pick([LOW, MID, HIGH]));

    } else if (phase === 1) {
      // Phase 2: both sides + occasional top drop
      if (roll < 0.35) {
        this.fireHorizontal("left",  Phaser.Math.RND.pick([LOW, MID, HIGH]));
        this.time.delayedCall(300, () => this.fireHorizontal("right", Phaser.Math.RND.pick([LOW, MID, HIGH])));
      } else if (roll < 0.7) {
        this.fireHorizontal("left",  Phaser.Math.RND.pick([LOW, MID]));
        this.fireHorizontal("right", Phaser.Math.RND.pick([MID, HIGH]));
      } else {
        this.fireFromTop(Phaser.Math.Between(200, W - 200));
      }

    } else if (phase === 2) {
      // Phase 3: diagonals + rain + combos
      if (roll < 0.25) {
        this.fireDiagonal("top-left");
        this.time.delayedCall(350, () => this.fireDiagonal("top-right"));
      } else if (roll < 0.5) {
        this.fireRain(4);
      } else if (roll < 0.75) {
        this.fireHorizontal("left",  LOW);
        this.fireHorizontal("right", HIGH);
        this.time.delayedCall(250, () => this.fireFromTop(Phaser.Math.Between(300, W - 300)));
      } else {
        this.fireFromTop(200);
        this.fireFromTop(W - 200);
        this.time.delayedCall(400, () => this.fireFromTop(W / 2));
      }

    } else {
      // Phase 4: full chaos
      if (roll < 0.25) {
        this.fireRain(4);
      } else if (roll < 0.5) {
        this.fireHorizontal("left",  LOW);
        this.fireHorizontal("right", HIGH);
        this.time.delayedCall(300, () => this.fireFromTop(W / 2));
      } else if (roll < 0.75) {
        this.fireDiagonal("top-left");
        this.time.delayedCall(350, () => this.fireDiagonal("top-right"));
      } else {
        this.fireRain(3);
        this.time.delayedCall(500, () => {
          this.fireHorizontal("left",  MID);
          this.fireHorizontal("right", MID);
        });
      }
    }
  }

  private fireHorizontal(from: "left" | "right", y: number) {
    const elapsed  = this.time.now - this.startTime;
    const speedMul = 1 + (elapsed / BOSS_DURATION) * 0.5;
    const baseSpd  = 280;
    const spawnX   = from === "left" ? -30 : W + 30;
    const velX     = from === "left" ? baseSpd * speedMul : -baseSpd * speedMul;
    this.spawnProjectile(spawnX, y, velX, 0, 0xbbbbbb);
  }

  private fireFromTop(x: number) {
    this.spawnProjectile(x, -30, Phaser.Math.FloatBetween(-30, 30), 0, 0x999999, true);
  }

  private fireDiagonal(from: "top-left" | "top-right") {
    const elapsed  = this.time.now - this.startTime;
    const speedMul = 1 + (elapsed / BOSS_DURATION) * 0.4;
    const spd = 240 * speedMul;
    const x   = from === "top-left" ? -30 : W + 30;
    const vx  = from === "top-left" ?  spd : -spd;
    this.spawnProjectile(x, -30, vx, spd * 0.7, 0xaaaaaa);
  }

  private fireRain(count: number) {
    const step = W / (count + 1);
    for (let i = 1; i <= count; i++) {
      const x = step * i + Phaser.Math.Between(-40, 40);
      this.time.delayedCall(i * 80, () => this.spawnProjectile(x, -30, Phaser.Math.FloatBetween(-20, 20), 0, 0x999999, true));
    }
  }

  private spawnProjectile(x: number, y: number, vx: number, vy: number, color: number, gravity = false) {
    const radius = 14;
    const key    = `bproj_${Date.now()}_${Math.random()}`;
    const gfx    = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(40).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.65);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.55, radius * 0.5, radius * 0.22);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(x, y, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(12);
    const pb = proj.body as Phaser.Physics.Arcade.Body;
    pb.setAllowGravity(gravity);
    proj.setVelocity(vx, vy);
    this.tweens.add({ targets: proj, angle: 360, duration: 700, repeat: -1 });

    // Efecto de viento: oscilación sinusoidal
    {
      let t = Phaser.Math.FloatBetween(0, Math.PI * 2); // fase aleatoria
      const windTimer = this.time.addEvent({
        delay: 50, loop: true,
        callback: () => {
          if (!proj.active) { windTimer.remove(); return; }
          t += 0.18;
          const body = proj.body as Phaser.Physics.Arcade.Body;
          if (gravity) {
            // Caen desde arriba: deriva horizontal
            body.setVelocityX(vx + Math.sin(t) * 35);
          } else {
            // Horizontales/diagonales: deriva vertical
            body.setVelocityY(vy + Math.sin(t) * 45);
          }
        },
      });
    }

    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Particles ─────────────────────────────────────────────────────

  private spawnParticles(x: number, y: number) {
    // Explosion animation
    const frames = 9;
    const frameDuration = 55;
    let frame = 0;
    const img = this.add.image(x, y, "expl_0")
      .setDepth(16).setScale(0.8).setAlpha(0.95);
    const timer = this.time.addEvent({
      delay: frameDuration,
      repeat: frames - 1,
      callback: () => {
        frame++;
        if (frame < frames) {
          img.setTexture(`expl_${frame}`);
        } else {
          img.destroy();
          timer.remove();
        }
      },
    });

    // Sparks
    const sparkKeys = ["ptcl_spark1", "ptcl_spark2", "ptcl_spark3"];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const speed = Phaser.Math.Between(50, 120);
      const spark = this.add.image(x, y, sparkKeys[i % sparkKeys.length])
        .setDepth(15)
        .setScale(Phaser.Math.FloatBetween(0.1, 0.25))
        .setTint(0xff6600)
        .setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scale: 0,
        duration: Phaser.Math.Between(300, 500),
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }


  // ── Hit & death ───────────────────────────────────────────────────

  private onHit() {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health     = Math.max(0, this.health - 1);
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

    this.vignetteRect.setAlpha(0.45);
    this.tweens.add({ targets: this.vignetteRect, alpha: 0, duration: 500 });

    const smogAlpha = ((10 - this.health) / 10) * 0.5;
    this.smogOverlay.setAlpha(smogAlpha);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.sound.stopByKey("sfx_hit_female");
        this.sound.stopByKey("sfx_hit_male");
        this.scene.start("GameOverScene", { from: "BossScene" });
      });
      return;
    }

    this.time.delayedCall(800, () => {
      this.player.clearTint();
      this.invincible = false;
    });
  }

  private onBossDefeated() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.sfx("sfx_goal", 0.9);

    // Factory shakes and explosion effect
    this.cameras.main.shake(1000, 0.015);

    // Big flash
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0)
      .setScrollFactor(0).setDepth(50);
    this.tweens.add({ targets: flash, alpha: 0.9, duration: 120, yoyo: true, repeat: 3 });

    // Explosions at stacks
    for (let i = 0; i < STACKS.length; i++) {
      this.time.delayedCall(i * 180, () => {
        const s = STACKS[i];
        this.spawnParticles(FAC_X + s.rx + s.w / 2, FAC_Y - s.h);
        this.spawnParticles(FAC_X + s.rx + s.w / 2, FAC_Y - s.h);
      });
    }

    const win = this.add.text(W / 2, H / 2 - 30, "¡FÁBRICA\nDESTRUIDA!", {
      fontSize: "42px", fontFamily: "'Press Start 2P'",
      color: "#ffdd00", stroke: "#000000", strokeThickness: 10,
      align: "center", lineSpacing: 12,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(55).setAlpha(0);

    this.tweens.add({ targets: win, alpha: 1, duration: 300, delay: 600 });

    this.time.delayedCall(3000, () => {
      // this.sound.stopAll();
      this.cameras.main.fadeOut(800, 255, 255, 255);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LevelCompleteScene"));
    });
  }

  // ── Util ──────────────────────────────────────────────────────────

  private sfx(key: string, volume = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }
}
