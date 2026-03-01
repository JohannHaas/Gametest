import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  private label!: Phaser.GameObjects.Text;
  private tapCount = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Background gradient feel
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // Title
    this.add.text(width / 2, height * 0.3, 'Gametest', {
      fontSize: `${Math.round(width * 0.1)}px`,
      color: '#e94560',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Interactive tap label
    this.label = this.add.text(width / 2, height * 0.55, 'Tap anywhere!', {
      fontSize: `${Math.round(width * 0.06)}px`,
      color: '#ffffff',
    }).setOrigin(0.5);

    // Touch / click input
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.tapCount++;
      this.label.setText(`Tapped ${this.tapCount}x at (${Math.round(pointer.x)}, ${Math.round(pointer.y)})`);

      // Flash effect on tap
      this.tweens.add({
        targets: this.label,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 80,
        yoyo: true,
      });
    });
  }
}
