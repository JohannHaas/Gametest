import Phaser from 'phaser';

type ControlMode = 'Pos' | 'Vel' | 'Acc';
interface TrailPoint { worldX: number; y: number; }
interface TargetComponent { amplitude: number; frequency: number; phase: number; }

export class GameScene extends Phaser.Scene {
  // ── Layout ────────────────────────────────────────────────────────────────
  private W = 0;
  private H = 0;
  private PANEL_Y = 0;
  private readonly GRID_SPACING = 40;
  private readonly SCROLL_SPEED = 60;
  private readonly DOT_RADIUS = 12;

  // ── Ed state ──────────────────────────────────────────────────────────────
  private edX = 0;
  private edY = 0;
  private edVel = 0;
  private edAcc = 0;

  // ── Grid ──────────────────────────────────────────────────────────────────
  private gridOffsetX = 0;

  // ── Trail ─────────────────────────────────────────────────────────────────
  private trail: TrailPoint[] = [];
  private trailSampleTimer = 0;
  private readonly TRAIL_SAMPLE_INTERVAL = 1 / 60;
  private readonly TRAIL_MAX_POINTS = 300;

  // ── Control / drag ────────────────────────────────────────────────────────
  private controlMode: ControlMode = 'Pos';
  private dragActive = false;
  private dragPointerId = -1;
  private dragStartY = 0;
  private dragStartValue = 0;
  private dragZoneTop = 0;
  private dragZoneHeight = 0;

  private readonly POS_SENS = 1.0;
  private readonly VEL_SENS = 600;
  private readonly ACC_SENS = 1200;
  private readonly MAX_VEL = 800;
  private readonly MAX_ACC = 1600;

  // ── Target curve ──────────────────────────────────────────────────────────
  private targetComponents: TargetComponent[] = [];
  private scoreSquaredSum = 0;
  private scoreFrameCount = 0;
  private paused = false;

  // ── Phaser objects ────────────────────────────────────────────────────────
  private gfxGrid!: Phaser.GameObjects.Graphics;
  private gfxTarget!: Phaser.GameObjects.Graphics;
  private gfxTrail!: Phaser.GameObjects.Graphics;
  private gfxDot!: Phaser.GameObjects.Graphics;
  private edLabel!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private pauseButton!: Phaser.GameObjects.Text;
  private modeButtons: Phaser.GameObjects.Text[] = [];
  private dragValueLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.PANEL_Y = this.H * 0.60;
    this.edX = this.W / 2;
    this.edY = this.PANEL_Y / 2;

    const btnH = 48;
    const row2H = 36;
    this.dragZoneTop = this.PANEL_Y + btnH + 8 + row2H + 16;
    this.dragZoneHeight = this.H - this.dragZoneTop - 8;

    this.generateTarget();

    // ── Graphics layers (order = z-order) ─────────────────────────────────
    this.gfxGrid = this.add.graphics();
    this.gfxTarget = this.add.graphics();
    this.gfxTrail = this.add.graphics();
    this.gfxDot = this.add.graphics();

    // ── Static panel background ────────────────────────────────────────────
    this.add.rectangle(this.W / 2, this.PANEL_Y + (this.H - this.PANEL_Y) / 2,
      this.W, this.H - this.PANEL_Y, 0x0d0d1a);

    // ── Panel divider ──────────────────────────────────────────────────────
    this.add.rectangle(this.W / 2, this.PANEL_Y, this.W, 2, 0x444466);

    // ── Mode buttons ──────────────────────────────────────────────────────
    const modes: ControlMode[] = ['Pos', 'Vel', 'Acc'];
    const btnW = this.W / 3;
    const btnY = this.PANEL_Y + btnH / 2 + 8;
    modes.forEach((mode, i) => {
      const btn = this.add.text(
        btnW * i + btnW / 2,
        btnY,
        mode,
        {
          fontSize: '22px',
          color: '#aaaacc',
          backgroundColor: '#22224a',
          padding: { x: 18, y: 10 },
        }
      ).setOrigin(0.5).setInteractive();

      btn.on('pointerdown', () => {
        this.controlMode = mode;
        this.edVel = 0;
        this.edAcc = 0;
        this.dragActive = false;
        this.dragPointerId = -1;
        this.updateButtonStyles();
      });

      this.modeButtons.push(btn);
    });
    this.updateButtonStyles();

    // ── Pause / Reset buttons (second row) ────────────────────────────────
    const row2Y = this.PANEL_Y + btnH + 8 + 18;  // center of second row

    this.pauseButton = this.add.text(this.W / 4, row2Y, '⏸  Pause', {
      fontSize: '18px',
      color: '#aaaacc',
      backgroundColor: '#22224a',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive();

    this.pauseButton.on('pointerdown', () => {
      this.paused = !this.paused;
      this.pauseButton.setText(this.paused ? '▶  Resume' : '⏸  Pause');
      this.pauseButton.setColor(this.paused ? '#44ff88' : '#aaaacc');
      this.pauseButton.setBackgroundColor(this.paused ? '#1a4a1a' : '#22224a');
    });

    const resetBtn = this.add.text(3 * this.W / 4, row2Y, '↺  Reset', {
      fontSize: '18px',
      color: '#cc8888',
      backgroundColor: '#22224a',
      padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setInteractive();

    resetBtn.on('pointerdown', () => {
      this.scoreSquaredSum = 0;
      this.scoreFrameCount = 0;
      this.trail = [];
      this.scoreLabel.setText('RMSE: —').setColor('#44ff88');
    });

    // ── Drag value label ──────────────────────────────────────────────────
    this.dragValueLabel = this.add.text(
      this.W / 2,
      this.dragZoneTop - 12,
      '',
      { fontSize: '16px', color: '#8888aa' }
    ).setOrigin(0.5, 1);

    // ── Drag zone hint ─────────────────────────────────────────────────────
    this.add.text(
      this.W / 2,
      this.dragZoneTop + this.dragZoneHeight / 2,
      '↕ drag here',
      { fontSize: '18px', color: '#333355' }
    ).setOrigin(0.5);

    // ── Score label (top-right of grid) ───────────────────────────────────
    this.scoreLabel = this.add.text(this.W - 12, 10, 'RMSE: —', {
      fontSize: '16px',
      color: '#44ff88',
    }).setOrigin(1, 0);

    // ── Ed label (moves with dot) ──────────────────────────────────────────
    this.edLabel = this.add.text(this.edX, this.edY - this.DOT_RADIUS - 6, 'Ed', {
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5, 1);

    // ── Input ──────────────────────────────────────────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.isInDragZone(p)) return;
      this.dragActive = true;
      this.dragPointerId = p.id;
      this.dragStartY = p.y;
      this.dragStartValue = this.getCurrentControlValue();
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragActive || p.id !== this.dragPointerId) return;
      const delta = this.dragStartY - p.y;
      this.applyDragDelta(delta);
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.dragPointerId) return;
      this.dragActive = false;
      this.dragPointerId = -1;
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (!this.paused) {
      this.gridOffsetX += this.SCROLL_SPEED * dt;
      this.integratePhysics(dt);
      this.updateScore();
      this.sampleTrail(dt);
      this.cullTrail();
    }

    this.clampEdY();  // always clamp so Pos drag works while paused
    this.drawGrid();
    this.drawTarget();
    this.drawTrail();
    this.drawDot();
    this.updateLabels();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private integratePhysics(dt: number): void {
    if (this.controlMode === 'Vel') {
      this.edY += this.edVel * dt;
    } else if (this.controlMode === 'Acc') {
      this.edVel += this.edAcc * dt;
      this.edVel = Phaser.Math.Clamp(this.edVel, -this.MAX_VEL, this.MAX_VEL);
      this.edY += this.edVel * dt;
    }
  }

  private clampEdY(): void {
    const min = this.DOT_RADIUS;
    const max = this.PANEL_Y - this.DOT_RADIUS;
    if (this.edY <= min || this.edY >= max) {
      this.edVel = 0;
    }
    this.edY = Phaser.Math.Clamp(this.edY, min, max);
  }

  private sampleTrail(dt: number): void {
    this.trailSampleTimer += dt;
    if (this.trailSampleTimer < this.TRAIL_SAMPLE_INTERVAL) return;
    this.trailSampleTimer = 0;
    this.trail.push({ worldX: this.gridOffsetX, y: this.edY });
    if (this.trail.length > this.TRAIL_MAX_POINTS) this.trail.shift();
  }

  private cullTrail(): void {
    while (this.trail.length > 0) {
      const screenX = this.edX + (this.trail[0].worldX - this.gridOffsetX);
      if (screenX >= 0) break;
      this.trail.shift();
    }
  }

  private drawGrid(): void {
    this.gfxGrid.clear();
    this.gfxGrid.lineStyle(1, 0x2a2a4a, 1.0);

    // Vertical lines
    const startX = this.GRID_SPACING - (this.gridOffsetX % this.GRID_SPACING);
    for (let x = startX; x < this.W; x += this.GRID_SPACING) {
      this.gfxGrid.beginPath();
      this.gfxGrid.moveTo(x, 0);
      this.gfxGrid.lineTo(x, this.PANEL_Y);
      this.gfxGrid.strokePath();
    }

    // Horizontal lines
    for (let y = 0; y <= this.PANEL_Y; y += this.GRID_SPACING) {
      this.gfxGrid.beginPath();
      this.gfxGrid.moveTo(0, y);
      this.gfxGrid.lineTo(this.W, y);
      this.gfxGrid.strokePath();
    }
  }

  private drawTrail(): void {
    this.gfxTrail.clear();
    this.gfxTrail.fillStyle(0xe94560, 0.4);
    for (const pt of this.trail) {
      const sx = this.edX + (pt.worldX - this.gridOffsetX);
      if (sx < 0 || sx > this.W || pt.y > this.PANEL_Y) continue;
      this.gfxTrail.fillCircle(sx, pt.y, 3);
    }
  }

  private drawDot(): void {
    this.gfxDot.clear();
    this.gfxDot.fillStyle(0xe94560, 1.0);
    this.gfxDot.fillCircle(this.edX, this.edY, this.DOT_RADIUS);

    // Move the "Ed" label with the dot
    this.edLabel.setPosition(this.edX, this.edY - this.DOT_RADIUS - 4);
  }

  private generateTarget(): void {
    for (let i = 0; i < 3; i++) {
      this.targetComponents.push({
        amplitude: 30 + Math.random() * 50,
        frequency: 0.005 + Math.random() * 0.012,
        phase:     Math.random() * Math.PI * 2,
      });
    }
  }

  private getTargetY(worldX: number): number {
    let y = this.PANEL_Y / 2;
    for (const c of this.targetComponents) {
      y += c.amplitude * Math.sin(c.frequency * worldX + c.phase);
    }
    return Phaser.Math.Clamp(y, this.DOT_RADIUS * 2, this.PANEL_Y - this.DOT_RADIUS * 2);
  }

  private updateScore(): void {
    const targetY = this.getTargetY(this.gridOffsetX);
    const err = this.edY - targetY;
    this.scoreSquaredSum += err * err;
    this.scoreFrameCount += 1;

    const rmse = Math.sqrt(this.scoreSquaredSum / this.scoreFrameCount);
    const color = rmse < 15 ? '#44ff88' : rmse < 40 ? '#ffcc00' : '#ff4466';
    this.scoreLabel.setColor(color);
    this.scoreLabel.setText(`RMSE: ${rmse.toFixed(1)} px`);
  }

  private drawTarget(): void {
    this.gfxTarget.clear();
    this.gfxTarget.lineStyle(2, 0x00ccff, 0.85);

    this.gfxTarget.beginPath();
    for (let sx = 0; sx <= this.W; sx += 3) {
      const worldX = this.gridOffsetX - this.edX + sx;
      const ty = this.getTargetY(worldX);
      if (sx === 0) this.gfxTarget.moveTo(sx, ty);
      else          this.gfxTarget.lineTo(sx, ty);
    }
    this.gfxTarget.strokePath();

    // Crosshair at current target position (at edX)
    const currentTargetY = this.getTargetY(this.gridOffsetX);
    this.gfxTarget.fillStyle(0x00ccff, 1.0);
    this.gfxTarget.fillRect(this.edX - 6, currentTargetY - 2, 12, 4);
    this.gfxTarget.fillRect(this.edX - 2, currentTargetY - 6, 4, 12);

    // Error bar from Ed to target
    this.gfxTarget.lineStyle(1, 0xffffff, 0.25);
    this.gfxTarget.beginPath();
    this.gfxTarget.moveTo(this.edX, this.edY);
    this.gfxTarget.lineTo(this.edX, currentTargetY);
    this.gfxTarget.strokePath();
  }

  private applyDragDelta(delta: number): void {
    switch (this.controlMode) {
      case 'Pos':
        this.edY = this.dragStartValue - delta * this.POS_SENS;
        break;
      case 'Vel':
        this.edVel = -(delta / this.dragZoneHeight) * this.VEL_SENS;
        this.edVel = Phaser.Math.Clamp(this.edVel, -this.MAX_VEL, this.MAX_VEL);
        break;
      case 'Acc':
        this.edAcc = -(delta / this.dragZoneHeight) * this.ACC_SENS;
        this.edAcc = Phaser.Math.Clamp(this.edAcc, -this.MAX_ACC, this.MAX_ACC);
        break;
    }
  }

  private getCurrentControlValue(): number {
    switch (this.controlMode) {
      case 'Pos': return this.edY;
      case 'Vel': return this.edVel;
      case 'Acc': return this.edAcc;
    }
  }

  private updateButtonStyles(): void {
    const modes: ControlMode[] = ['Pos', 'Vel', 'Acc'];
    this.modeButtons.forEach((btn, i) => {
      if (modes[i] === this.controlMode) {
        btn.setColor('#ffffff');
        btn.setBackgroundColor('#3a3a7a');
      } else {
        btn.setColor('#aaaacc');
        btn.setBackgroundColor('#22224a');
      }
    });
  }

  private updateLabels(): void {
    const val = this.getCurrentControlValue();
    const unit = this.controlMode === 'Pos' ? 'px' :
                 this.controlMode === 'Vel' ? 'px/s' : 'px/s²';
    this.dragValueLabel.setText(`${this.controlMode}: ${val.toFixed(1)} ${unit}`);
  }

  private isInDragZone(p: Phaser.Input.Pointer): boolean {
    return p.y >= this.dragZoneTop && p.y <= this.H;
  }
}
