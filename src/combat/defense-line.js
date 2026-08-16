import * as THREE from 'three';
import { geo, glowTexture } from '../ships/common.js';
import { FlashPool } from './effects.js';
import { DEFENSE, FIELD } from './tuning.js';

// 방어선.
//
// 이 게임의 압박은 전부 이 한 줄에서 나온다. 적이 여길 넘으면 체력이 깎이고,
// 보스가 여길 밟으면 기체가 깔린다. 그런데 그동안 선이 보이지 않아,
// 피해가 이유 없이 들어오는 것처럼 느껴졌다. 그래서 눈에 보이게 그린다.
//
// 구성은 세 겹이다.
//   심지(core)  — 얇고 밝은 띠. 선의 위치를 또렷하게 알린다.
//   글로우(glow) — 위아래로 번지는 넓은 띠. 은은한 빛을 준다.
//   물결(ripple) — 뚫린 자리에만 잠깐 터지는 붉은 빛무리.
//
// 평소에는 시안으로 천천히 숨 쉬고, 뚫리면 그 순간 붉게 물들며 위아래로 출렁인다.

const _cyan = new THREE.Color(DEFENSE.COLOR);
const _red = new THREE.Color(DEFENSE.BREACH_COLOR);

export class DefenseLine {
  /**
   * @param {THREE.Scene} scene
   * @param {number} halfWidth 화면에 보이는 가로 반폭
   */
  constructor(scene, halfWidth) {
    this.y = FIELD.DEFENSE_LINE_Y;
    this.time = 0;
    this.breach = 0; // 붉게 물든 채 남은 시간(초)
    this.threat = 0; // 0~1. 보스가 다가올수록 오른다. 선이 미리 붉어지며 경고한다.

    this.group = new THREE.Group();
    this.group.position.set(0, this.y, 0);
    scene.add(this.group);

    // 가로 길이는 1로 만들어 두고 scale.x로 늘린다. 리사이즈마다 지오메트리를 새로 만들지 않는다.
    this.coreMat = new THREE.MeshBasicMaterial({
      color: DEFENSE.COLOR,
      toneMapped: false,
      transparent: true,
      opacity: DEFENSE.CORE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: DEFENSE.COLOR,
      toneMapped: false,
      transparent: true,
      opacity: DEFENSE.GLOW_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const unit = geo('defense.unit.g', () => new THREE.PlaneGeometry(1, 1));

    this.core = new THREE.Mesh(unit, this.coreMat);
    this.core.renderOrder = 1;
    this.group.add(this.core);

    this.glow = new THREE.Mesh(unit, this.glowMat);
    this.glow.renderOrder = 1;
    this.group.add(this.glow);

    // 뚫린 자리에만 터지는 붉은 빛무리
    this.ripple = new FlashPool(scene, {
      color: DEFENSE.BREACH_COLOR,
      size: DEFENSE.RIPPLE_SIZE,
      life: DEFENSE.RIPPLE_TIME,
      count: DEFENSE.RIPPLE_POOL,
      opacity: 0.9,
      intensity: 1.8,
    });

    this.setBounds(halfWidth);
  }

  /** 화면 폭이 바뀌면 선도 함께 늘어난다. 화면 밖까지 조금 넉넉히 뺀다. */
  setBounds(halfWidth) {
    const width = halfWidth * 2.2;
    this.core.scale.set(width, DEFENSE.CORE_HEIGHT, 1);
    this.glow.scale.set(width, DEFENSE.GLOW_HEIGHT, 1);
  }

  /**
   * 적이 선을 넘었다. 그 자리에서 붉게 출렁인다.
   * @param {number} x 넘은 지점
   */
  hit(x) {
    this.breach = DEFENSE.BREACH_TIME;
    this.ripple.spawn(x, this.y, 0.35);
  }

  /**
   * 보스가 얼마나 가까운가(0~1). 1에 가까울수록 선이 미리 붉어지고 빨리 뛴다.
   * 보스의 즉사선도 결국 이 선이므로, 같은 색으로 같은 위험을 말한다.
   */
  setThreat(t) {
    this.threat = Math.min(Math.max(t, 0), 1);
  }

  update(dt) {
    this.time += dt;
    this.ripple.update(dt);

    // 평상시엔 천천히, 보스가 다가오면 빠르게 숨 쉰다.
    const period = DEFENSE.BREATH_PERIOD * (1 - this.threat * 0.7);
    const depth = DEFENSE.BREATH_DEPTH + this.threat * 0.35;
    const breath = 1 - depth * (0.5 - 0.5 * Math.cos((this.time / period) * Math.PI * 2));

    // 붉은 정도: 뚫린 직후가 가장 세고, 보스가 다가온 만큼 미리 물들어 있다.
    this.breach = Math.max(this.breach - dt, 0);
    const hurt = this.breach / DEFENSE.BREACH_TIME;
    const red = Math.max(hurt, this.threat * 0.8);

    this.coreMat.color.copy(_cyan).lerp(_red, red);
    this.glowMat.color.copy(_cyan).lerp(_red, red);
    this.coreMat.opacity = Math.min(DEFENSE.CORE_OPACITY * breath + hurt * 0.9, 1);
    this.glowMat.opacity = Math.min(DEFENSE.GLOW_OPACITY * breath + hurt * 0.55, 1);

    // 뚫린 자리에서 위아래로 잠깐 출렁인다. 진폭은 시간이 갈수록 잦아든다.
    this.group.position.y =
      this.y + Math.sin(this.time * DEFENSE.WOBBLE_FREQ) * DEFENSE.WOBBLE_AMP * hurt * hurt;
  }

  /** 상태 전환·재시작 때 연출을 되돌린다. */
  reset() {
    this.breach = 0;
    this.threat = 0;
    this.group.position.y = this.y;
    this.coreMat.color.copy(_cyan);
    this.glowMat.color.copy(_cyan);
    this.coreMat.opacity = DEFENSE.CORE_OPACITY;
    this.glowMat.opacity = DEFENSE.GLOW_OPACITY;
    this.ripple.reset();
  }
}
