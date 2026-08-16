import * as THREE from 'three';

// 카메라 연출: 부드러운 추적(follow)과 흔들림(shake) 효과.
// 카메라의 "기준 위치"는 basePosition에 두고, 매 프레임 shake 오프셋을 더해 실제 위치를 계산한다.

export class CameraFX {
  constructor(camera, basePosition) {
    this.camera = camera;
    this.basePosition = basePosition.clone();

    this.shakeTime = 0;
    this.shakeDuration = 0;
    this.shakeStrength = 0;

    this.followTarget = new THREE.Vector3().copy(basePosition);
    this.followLerpSpeed = 3;
  }

  /**
   * 기준 위치를 갈아 끼운다. 머지 보드 높이에 맞춰 화면 구성을 다시 잡을 때 쓴다.
   * 흔들리는 도중이라도 다음 프레임부터 새 자리를 기준으로 삼는다.
   */
  setBase(position) {
    this.basePosition.copy(position);
    this.followTarget.copy(position);
  }

  // 흔들림 시작. strength: 흔들림 세기, duration: 지속 시간(초)
  shake(strength = 0.4, duration = 0.3) {
    this.shakeStrength = strength;
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  update(dt) {
    // 기준 위치를 향해 부드럽게 추적
    this.basePosition.lerp(this.followTarget, Math.min(this.followLerpSpeed * dt, 1));

    let offsetX = 0;
    let offsetY = 0;

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const progress = Math.max(this.shakeTime / this.shakeDuration, 0);
      const decay = progress * progress; // 시간이 지날수록 감쇠

      offsetX = (Math.random() - 0.5) * 2 * this.shakeStrength * decay;
      offsetY = (Math.random() - 0.5) * 2 * this.shakeStrength * decay;
    }

    this.camera.position.set(
      this.basePosition.x + offsetX,
      this.basePosition.y + offsetY,
      this.basePosition.z
    );
  }
}
