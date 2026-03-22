import Phaser from "phaser";

const W       = 1280;
const H       = 720;
const FLOOR_Y = 628;

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
const DASH_COOLDOWN   = 1400;
const DASH_DURATION   = 180;
const DASH_SPEED      = 620;

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
  private shiftKey!:  Phaser.Input.Keyboard.Key;
  private pad:        Phaser.Input.Gamepad.Gamepad | null = null;

  private health        = 10;
  private invincible    = false;
  private dashInvincible = false;
  private isDashing     = false;
  private isCrouching   = false;
  private jumpsAvailable = 2;
  private jumpCount     = 0;
  private wasOnGround   = false;
  private lastDashTime  = -9999;
  private padWasB       = false;
  private levelComplete = false;

  private bossBarGfx!:  Phaser.GameObjects.Graphics;
  private healthBarGfx!: Phaser.GameObjects.Graphics;
  private vignetteRect!: Phaser.GameObjects.Rectangle;
  private smogOverlay!: Phaser.GameObjects.Rectangle;
  private warningLights: { gfx: Phaser.GameObjects.Ellipse; on: boolean }[] = [];
  private smokeParticles: SmokeParticle[] = [];
  private startTime = -1;

  private powerups!:     Phaser.Physics.Arcade.StaticGroup;
  private maskInvincible = false;
  private maskEndTime    = 0;
  private blinkTween:    Phaser.Tweens.Tween | null = null;
  private maskBarGfx!:   Phaser.GameObjects.Graphics;
  private maskIcon!:     Phaser.GameObjects.Graphics;

  constructor() { super("BossScene"); }

  preload() {
    if (!this.cache.audio.exists("bossbattle"))
      this.load.audio("bossbattle", "/assets/music/bossbattle.mp3");

    const sfxMap: [string, string][] = [
      ["sfx_powerup",    "/assets/sfx/SoundBonus.wav"],
      ["sfx_jump",       "/assets/sfx/SoundJump1.wav"],
      ["sfx_doublejump", "/assets/sfx/SoundJump2.wav"],
      ["sfx_land",       "/assets/sfx/SoundLand1.wav"],
      ["sfx_hit",        "/assets/sfx/SoundPlayerHit.wav"],
      ["sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav"],
      ["sfx_goal",       "/assets/sfx/SoundReachGoal.wav"],
      ["sfx_gameover",   "/assets/sfx/SoundGameOver.wav"],
      ["sfx_dash",       "/assets/sfx/SoundSpecialSkill.wav"],
      ["sfx_death",      "/assets/sfx/SoundDeath.wav"],
    ];
    for (const [key, path] of sfxMap) {
      if (!this.cache.audio.exists(key)) this.load.audio(key, path);
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
    this.dashInvincible  = false;
    this.isDashing       = false;
    this.isCrouching     = false;
    this.jumpsAvailable  = 2;
    this.jumpCount       = 0;
    this.wasOnGround     = false;
    this.lastDashTime    = -9999;
    this.startTime       = -1; // set on first update tick
    this.smokeParticles  = [];
    this.warningLights   = [];
    this.maskInvincible  = false;
    this.maskEndTime     = 0;
    this.blinkTween      = null;

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
      this.spawnParticles(p.x, p.y);
      this.sfx("sfx_explode", 0.5);
      p.destroy();
      this.onHit();
    });

    // ── Input ─────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => { this.pad = pad; });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);

    // ── Mask HUD ──────────────────────────────────────────────────
    this.maskIcon   = this.add.graphics().setScrollFactor(0).setDepth(23);
    this.maskBarGfx = this.add.graphics().setScrollFactor(0).setDepth(23);

    // ── Power-ups ─────────────────────────────────────────────────
    this.setupPowerups();

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
    this.sound.stopAll();
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
      const warn = this.add.text(W / 2, H * 0.38, "⚠ WARNING ⚠", {
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

    // "FÁBRICA DE SMOG" slams in with zoom
    this.time.delayedCall(2200, () => {
      const title = this.add.text(W / 2, H / 2 - 20, "FÁBRICA\nDE SMOG", {
        fontSize: "60px", fontFamily: "'Press Start 2P'",
        color: "#ff2200", stroke: "#000000", strokeThickness: 12,
        align: "center", lineSpacing: 10,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setScale(2.5).setAlpha(0);

      this.tweens.add({
        targets: title,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 180, ease: "Back.Out",
      });
      this.cameras.main.shake(250, 0.018);

      this.tweens.add({
        targets: title, alpha: 0,
        duration: 350, delay: 1400,
        onComplete: () => title.destroy(),
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
    const ringTween = this.time.addEvent({
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
      this.sound.play("bossbattle", { loop: true, volume: 0.7 });
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
      if (!this.wasOnGround) this.sfx("sfx_land", 0.4);
      this.jumpsAvailable = 2;
      this.jumpCount      = 0;
    }
    this.wasOnGround = onGround;

    // ── Mask timer ────────────────────────────────────────────────
    if (this.maskInvincible) {
      const remaining = this.maskEndTime - this.time.now;
      if (remaining <= 0) this.deactivateMask();
      else this.drawMaskBar(remaining / 6000);
    }

    // ── Boss bar (time-based depletion) ───────────────────────────
    const elapsed    = this.time.now - this.startTime;
    const bossHealth = Math.max(0, 1 - elapsed / BOSS_DURATION);
    this.drawBossBar(bossHealth);
    if (bossHealth <= 0) { this.onBossDefeated(); return; }

    // ── Input ─────────────────────────────────────────────────────
    const lx      = this.pad?.leftStick.x ?? 0;
    const buttonA = this.pad?.isButtonDown(0) ?? false;
    const buttonB = this.pad?.isButtonDown(1) ?? false;

    const goLeft  = this.cursors.left.isDown  || lx < -0.3 || (this.pad?.left  ?? false);
    const goRight = this.cursors.right.isDown || lx >  0.3 || (this.pad?.right ?? false);
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false);
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonA;
    const doDash  = (Phaser.Input.Keyboard.JustDown(this.shiftKey) || (buttonB && !this.padWasB)) &&
                    !this.isDashing && (this.time.now - this.lastDashTime) > DASH_COOLDOWN;
    this.padWasB  = buttonB;

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

    if (doDash && !this.isCrouching) {
      this.performDash(goLeft ? -1 : goRight ? 1 : (this.player.flipX ? -1 : 1));
    }

    if (!this.isDashing) {
      if (goLeft)       { this.player.setVelocityX(-220); this.player.setFlipX(true);  }
      else if (goRight) { this.player.setVelocityX( 220); this.player.setFlipX(false); }
      else              { this.player.setVelocityX(0); }
    }

    if (jump && this.jumpsAvailable > 0 && !this.isCrouching) {
      this.player.setVelocityY(-520);
      this.sfx(this.jumpCount === 0 ? "sfx_jump" : "sfx_doublejump", 0.6);
      this.jumpCount++;
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
    // Smoggy gradient sky
    const sky = this.add.graphics().setDepth(-5);
    sky.fillGradientStyle(0x1a0a00, 0x1a0a00, 0x3d1a00, 0x3d1a00, 1);
    sky.fillRect(0, 0, W, FLOOR_Y);
    // Ground
    this.add.rectangle(W / 2, FLOOR_Y + (H - FLOOR_Y) / 2, W, H - FLOOR_Y, 0x111111).setDepth(-4);

    // Distant haze layers
    const haze = this.add.graphics().setDepth(-4);
    haze.fillStyle(0x331500, 0.3);
    haze.fillRect(0, FLOOR_Y - 120, W, 120);
    haze.fillStyle(0x662200, 0.12);
    haze.fillRect(0, FLOOR_Y - 280, W, 200);
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
    // Shadow
    g.fillStyle(0x000000, 0.5);
    g.fillRect(FAC_X + 8, FAC_Y + 8, FAC_W, FAC_H);
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

    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < winCols; col++) {
        const wx = FAC_X + winPadX + col * (winW + winPadX);
        const wy = winStartY + row * (winH + winPadY);
        if (wy + winH > FLOOR_Y - 60) continue; // skip bottom row near gate
        const hash = (col * 7 + row * 13) % 10;
        if (hash < 6) {
          // Lit window
          g.fillStyle(0xff8800, 0.15);
          g.fillRect(wx - 4, wy - 4, winW + 8, winH + 8);
          g.fillStyle(hash < 3 ? 0xffaa44 : 0xff7700, 0.9);
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
    const signH = 44;
    const signX = FAC_X + FAC_W / 2 - signW / 2;
    const signY = FAC_Y + 18;
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(signX, signY, signW, signH);
    g.fillStyle(0xcc2200, 1);
    g.fillRect(signX + 2, signY + 2, signW - 4, 3);
    g.fillRect(signX + 2, signY + signH - 5, signW - 4, 3);
    this.add.text(signX + signW / 2, signY + signH / 2, "SMOG CORP", {
      fontSize: "18px", fontFamily: "'Press Start 2P'",
      color: "#ff4400",
    }).setOrigin(0.5).setDepth(3);

    // ── Horizontal pipes ──────────────────────────────────────────
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(FAC_X, FLOOR_Y - 80, FAC_W, 14);
    g.fillRect(FAC_X, FLOOR_Y - 140, FAC_W * 0.4, 10);
    g.fillRect(FAC_X + FAC_W * 0.6, FLOOR_Y - 160, FAC_W * 0.4, 10);
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(FAC_X, FLOOR_Y - 76, FAC_W, 4);

    // ── Concrete floor in front ───────────────────────────────────
    g.fillStyle(0x1e1e1e, 1);
    g.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(0, FLOOR_Y, W, 6);
    // Floor cracks/lines
    g.lineStyle(1, 0x2e2e2e, 0.6);
    for (let x = 80; x < W; x += 80) {
      g.beginPath(); g.moveTo(x, FLOOR_Y); g.lineTo(x, H); g.strokePath();
    }
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
    // Boss bar background + label
    this.add.rectangle(W / 2, 22, W * 0.7, 28, 0x111111, 0.85)
      .setScrollFactor(0).setDepth(20);
    this.add.text(W / 2, 22, "FÁBRICA DE SMOG", {
      fontSize: "9px", fontFamily: "'Press Start 2P'", color: "#ff4400",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(21);

    this.bossBarGfx = this.add.graphics().setScrollFactor(0).setDepth(22);

    // Player health (same style as GameScene)
    this.add.text(20, 20, "AIRE", {
      fontSize: "10px", fontFamily: "'Press Start 2P'", color: "#ffffff",
    }).setScrollFactor(0).setDepth(20);
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
    const by = 32;
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
    const segments = 10;
    const segH = 16, segGap = 1, innerW = 22, railW = 7;
    const totalW = innerW + railW * 2;
    const totalH = segments * segH + (segments - 1) * segGap;
    const barX = 20, barTop = 38;
    this.healthBarGfx.clear();

    this.healthBarGfx.fillStyle(0x222222, 1);
    this.healthBarGfx.fillRect(barX, barTop - 10, totalW, 10);
    this.healthBarGfx.fillStyle(0x110000, 1);
    this.healthBarGfx.fillRect(barX + railW, barTop, innerW, totalH);

    for (let i = 0; i < segments; i++) {
      const segY   = barTop + totalH - (i + 1) * segH - i * segGap;
      const filled = i < this.health;
      if (filled) {
        this.healthBarGfx.fillStyle(0xcc2200, 1);
        this.healthBarGfx.fillRect(barX + railW, segY + segH / 2, innerW, segH / 2);
        this.healthBarGfx.fillStyle(0xff7722, 1);
        this.healthBarGfx.fillRect(barX + railW, segY, innerW, segH / 2);
        this.healthBarGfx.fillStyle(0xffcc66, 0.35);
        this.healthBarGfx.fillRect(barX + railW, segY, innerW, 2);
      } else {
        this.healthBarGfx.fillStyle(0x1e0000, 1);
        this.healthBarGfx.fillRect(barX + railW, segY, innerW, segH);
      }
      this.healthBarGfx.fillStyle(0x000000, 1);
      this.healthBarGfx.fillRect(barX + railW, segY + segH - 1, innerW, 1);
    }
    for (const rx of [barX, barX + railW + innerW]) {
      this.healthBarGfx.fillStyle(0x888888, 1);
      this.healthBarGfx.fillRect(rx, barTop, railW, totalH);
      this.healthBarGfx.fillStyle(0xdddddd, 1);
      this.healthBarGfx.fillRect(rx, barTop, 2, totalH);
    }
    this.healthBarGfx.fillStyle(0x222222, 1);
    this.healthBarGfx.fillRect(barX, barTop + totalH, totalW, 8);
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
      const interval = [2000, 1400, 1000, 700][phase];

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
      if (roll < 0.2) {
        this.fireRain(6);
      } else if (roll < 0.4) {
        this.fireHorizontal("left",  LOW);
        this.fireHorizontal("right", LOW);
        this.time.delayedCall(200, () => {
          this.fireHorizontal("left",  HIGH);
          this.fireHorizontal("right", HIGH);
        });
      } else if (roll < 0.6) {
        this.fireDiagonal("top-left");
        this.fireDiagonal("top-right");
        this.time.delayedCall(300, () => this.fireFromTop(W / 2));
      } else if (roll < 0.8) {
        this.fireRain(3);
        this.time.delayedCall(400, () => {
          this.fireHorizontal("left",  MID);
          this.fireHorizontal("right", MID);
        });
      } else {
        // Wall of fire - everything at once
        this.fireHorizontal("left",  LOW);
        this.fireHorizontal("right", HIGH);
        this.fireDiagonal("top-left");
        this.time.delayedCall(350, () => {
          this.fireHorizontal("left",  HIGH);
          this.fireHorizontal("right", LOW);
          this.fireDiagonal("top-right");
        });
      }
    }
  }

  private fireHorizontal(from: "left" | "right", y: number) {
    const elapsed  = this.time.now - this.startTime;
    const speedMul = 1 + (elapsed / BOSS_DURATION) * 0.9;
    const baseSpd  = 280;
    const spawnX   = from === "left" ? -30 : W + 30;
    const velX     = from === "left" ? baseSpd * speedMul : -baseSpd * speedMul;
    this.spawnProjectile(spawnX, y, velX, 0, 0xcc4400);
  }

  private fireFromTop(x: number) {
    this.spawnProjectile(x, -30, Phaser.Math.FloatBetween(-30, 30), 0, 0x88cc00, true);
  }

  private fireDiagonal(from: "top-left" | "top-right") {
    const elapsed  = this.time.now - this.startTime;
    const speedMul = 1 + (elapsed / BOSS_DURATION) * 0.7;
    const spd = 240 * speedMul;
    const x   = from === "top-left" ? -30 : W + 30;
    const vx  = from === "top-left" ?  spd : -spd;
    this.spawnProjectile(x, -30, vx, spd * 0.7, 0xcc8800);
  }

  private fireRain(count: number) {
    const step = W / (count + 1);
    for (let i = 1; i <= count; i++) {
      const x = step * i + Phaser.Math.Between(-40, 40);
      this.time.delayedCall(i * 80, () => this.spawnProjectile(x, -30, Phaser.Math.FloatBetween(-20, 20), 0, 0x44cc88, true));
    }
  }

  private spawnProjectile(x: number, y: number, vx: number, vy: number, color: number, gravity = false) {
    const radius = 14;
    const key    = `bproj_${Date.now()}_${Math.random()}`;
    const gfx    = this.make.graphics({ x: 0, y: 0, add: false });
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
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Particles ─────────────────────────────────────────────────────

  private spawnParticles(x: number, y: number) {
    const colors = [0xff4400, 0xff8800, 0xffcc00, 0xaadd00];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = Phaser.Math.Between(60, 130);
      const key   = `bptcl_${Date.now()}_${i}`;
      const gfx   = this.make.graphics({ x: 0, y: 0, add: false });
      gfx.fillStyle(colors[i % colors.length], 1);
      gfx.fillCircle(4, 4, 4);
      gfx.generateTexture(key, 8, 8);
      gfx.destroy();
      const dot = this.add.image(x, y, key).setDepth(15);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 360, ease: "Quad.Out",
        onComplete: () => { dot.destroy(); if (this.textures.exists(key)) this.textures.remove(key); },
      });
    }
  }

  // ── Dash ──────────────────────────────────────────────────────────

  private performDash(dir: number) {
    this.isDashing      = true;
    this.dashInvincible = true;
    this.lastDashTime   = this.time.now;
    this.sfx("sfx_dash", 0.5);
    this.player.setVelocityX(dir * DASH_SPEED);
    this.player.setFlipX(dir < 0);
    this.player.setTint(0x88ccff);
    this.time.delayedCall(DASH_DURATION, () => {
      this.isDashing      = false;
      this.dashInvincible = false;
      this.player.clearTint();
    });
  }

  // ── Hit & death ───────────────────────────────────────────────────

  private onHit() {
    if (this.invincible || this.dashInvincible || this.maskInvincible || this.levelComplete) return;
    this.invincible = true;
    this.health     = Math.max(0, this.health - 1);
    this.drawHealthBar();
    this.sfx("sfx_hit", 0.7);
    this.player.setTint(0xff4444);
    this.cameras.main.shake(200, 0.007);

    this.vignetteRect.setAlpha(0.45);
    this.tweens.add({ targets: this.vignetteRect, alpha: 0, duration: 500 });

    const smogAlpha = ((10 - this.health) / 10) * 0.5;
    this.smogOverlay.setAlpha(smogAlpha);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.sfx("sfx_death", 0.8);
      this.sound.stopByKey("bossbattle");
      this.time.delayedCall(600, () => this.sfx("sfx_gameover", 0.8));
      this.cameras.main.fadeOut(900, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("GameOverScene"));
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
      this.sound.stopAll();
      this.cameras.main.fadeOut(800, 255, 255, 255);
      this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("LevelCompleteScene"));
    });
  }

  // ── Power-up: cubrebocas ─────────────────────────────────────────

  private setupPowerups() {
    this.powerups = this.physics.add.staticGroup();

    // Spawn 3 masks at fixed positions across the arena
    for (const x of [220, W / 2, W - 220]) {
      this.spawnMaskAt(x);
    }

    this.physics.add.overlap(this.player, this.powerups, (_p, mask) => {
      (mask as Phaser.Physics.Arcade.Image).destroy();
      this.activateMask();
    });
  }

  private spawnMaskAt(x: number) {
    const y   = FLOOR_Y - 48;
    const key = `bmask_${x}`;
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(0xe8f4ff, 1);
    gfx.fillRoundedRect(2, 8, 44, 28, 6);
    gfx.lineStyle(1.5, 0xaaccee, 0.7);
    gfx.lineBetween(2, 16, 46, 16);
    gfx.lineBetween(2, 24, 46, 24);
    gfx.lineBetween(2, 32, 46, 32);
    gfx.lineStyle(2, 0xaaaaaa, 1);
    gfx.strokeCircle(4, 16, 6);
    gfx.strokeCircle(44, 16, 6);
    gfx.fillStyle(0x8899aa, 1);
    gfx.fillRect(10, 8, 28, 3);
    gfx.lineStyle(2, 0x44aaff, 0.8);
    gfx.strokeRoundedRect(2, 8, 44, 28, 6);
    gfx.generateTexture(key, 48, 48);
    gfx.destroy();

    const mask = this.powerups.create(x, y, key) as Phaser.Physics.Arcade.Image;
    mask.setDepth(12).refreshBody();

    this.tweens.add({ targets: mask, y: y - 12, duration: 900, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
    this.tweens.add({ targets: mask, alpha: 0.55, duration: 650, ease: "Sine.easeInOut", yoyo: true, repeat: -1 });
  }

  private activateMask() {
    this.maskInvincible = true;
    this.maskEndTime    = this.time.now + 6000;
    this.sfx("sfx_powerup", 0.8);

    const txt = this.add.text(this.player.x, this.player.y - 90, "¡CUBREBOCAS!", {
      fontSize: "14px", fontFamily: "'Press Start 2P'",
      color: "#44eeff", stroke: "#003355", strokeThickness: 5,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({ targets: txt, y: txt.y - 50, alpha: 0, duration: 1400, ease: "Quad.Out", onComplete: () => txt.destroy() });

    this.player.clearTint();
    this.player.setTint(0x44eeff);
    this.blinkTween = this.tweens.add({ targets: this.player, alpha: 0.3, duration: 120, yoyo: true, repeat: -1 });
    this.drawMaskBar(1);
  }

  private deactivateMask() {
    this.maskInvincible = false;
    this.blinkTween?.stop();
    this.blinkTween = null;
    this.player.setAlpha(1);
    this.player.clearTint();
    this.maskBarGfx.clear();
    this.maskIcon.clear();
  }

  private drawMaskBar(fraction: number) {
    const bx = 20, by = H - 36, bw = 120, bh = 10;
    this.maskBarGfx.clear();
    this.maskBarGfx.fillStyle(0x111111, 0.8);
    this.maskBarGfx.fillRect(bx, by, bw, bh);
    this.maskBarGfx.fillStyle(0x44eeff, 1);
    this.maskBarGfx.fillRect(bx, by, bw * fraction, bh);
    this.maskBarGfx.lineStyle(1, 0x0088aa, 1);
    this.maskBarGfx.strokeRect(bx, by, bw, bh);
    this.maskIcon.clear();
    this.maskIcon.fillStyle(0x44eeff, 0.9);
    this.maskIcon.fillRoundedRect(bx, by - 18, 14, 10, 2);
    this.maskIcon.lineStyle(1, 0x0088aa, 1);
    this.maskIcon.strokeRoundedRect(bx, by - 18, 14, 10, 2);
  }

  // ── Util ──────────────────────────────────────────────────────────

  private sfx(key: string, volume = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
  }
}
