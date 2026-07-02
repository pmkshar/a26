/* ============================================================
   A26 — AI DIGITAL HUMAN DEALER
   - 3D-styled SVG humanoid with face, eyes, mouth, hair, body
   - Real-time facial animation: blink, lip-sync, breathe, sway
   - Pose states: idle / shuffling / cutting / dealing / reveal-win / reveal-lose
   - Web Speech API voice with female voice selection + emotional modulation
   - Emotive dialogue engine (LLM-style contextual responses)
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- VOICE MANAGER ----------
  const Voice = {
    synth: null,
    voice: null,
    enabled: true,
    queue: [],
    speaking: false,
    init() {
      if (!('speechSynthesis' in window)) return;
      this.synth = window.speechSynthesis;
      const pick = () => {
        const voices = this.synth.getVoices();
        if (!voices.length) return;
        // Prefer female en-IN / en-GB / en-US voices
        const prefs = [
          v => v.lang === 'en-IN' && /female|priya|isha|kalpana|raveena/i.test(v.name),
          v => v.lang === 'en-IN',
          v => /female|raveena|samantha|victoria|karen|tessa|fiona|moira/i.test(v.name),
          v => v.lang === 'en-GB' && /female/i.test(v.name),
          v => v.lang === 'en-US' && /female/i.test(v.name),
          v => v.lang.startsWith('en')
        ];
        for (const pref of prefs) {
          const match = voices.find(pref);
          if (match) { this.voice = match; break; }
        }
        if (!this.voice) this.voice = voices[0];
      };
      pick();
      this.synth.onvoiceschanged = pick;
    },
    speak(text, opts = {}) {
      if (!this.synth || !this.enabled) {
        // Even when voice is off, drive the lip-sync animation by simulating duration
        Human.lipSync(text, opts);
        return;
      }
      // Cancel current speech
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = opts.rate || 1.0;
      u.pitch = opts.pitch || 1.05;
      u.volume = opts.volume ?? 1.0;
      u.onstart = () => { Human.lipSyncStart(opts); };
      u.onend = () => { Human.lipSyncStop(); };
      u.onerror = () => { Human.lipSyncStop(); };
      this.synth.speak(u);
    },
    cancel() {
      if (this.synth) this.synth.cancel();
      Human.lipSyncStop();
    },
    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled) this.cancel();
      return this.enabled;
    }
  };

  // ---------- EMOTIVE DIALOGUE ENGINE (LLM-style) ----------
  // Each entry: contextual lines tagged with emotion + speech params
  const Dialogue = {
    lines: {
      welcome: [
        { t: "Welcome to A26, where six houses wait for your luck. Place your bets.", e: 'happy', p: 1.05, r: 0.98 },
        { t: "Good evening, player. The cards are warm tonight. Choose your house.", e: 'happy', p: 1.08, r: 1.0 },
        { t: "Hello! I am Priya, your digital dealer. Shall we begin?", e: 'happy', p: 1.06, r: 1.0 },
        { t: "Six houses, three cards, and one chance to win big. Ready?", e: 'playful', p: 1.1, r: 1.02 }
      ],
      betPlaced: [
        { t: "Bet placed. Choose another house, or deal when ready.", e: 'neutral', p: 1.0, r: 1.0 },
        { t: "Lovely choice. The felt is yours.", e: 'happy', p: 1.06, r: 1.0 },
        { t: "Good. I can feel your confidence from here.", e: 'playful', p: 1.08, r: 1.0 },
        { t: "Noted. Your stake is locked in.", e: 'neutral', p: 1.0, r: 1.0 }
      ],
      betClosed: [
        { t: "Bets are closing in three seconds. Final wagers only.", e: 'serious', p: 0.98, r: 0.98 },
        { t: "Last call, player. The deck is hungry.", e: 'playful', p: 1.05, r: 1.0 }
      ],
      shuffling: [
        { t: "Shuffling the deck. Listen carefully — that's the sound of fortune.", e: 'neutral', p: 1.0, r: 0.95 },
        { t: "Fifty-two cards, perfectly mixed. No favourites here.", e: 'playful', p: 1.05, r: 1.0 },
        { t: "The shuffle begins. Lady luck has her eyes on someone tonight.", e: 'happy', p: 1.06, r: 0.98 }
      ],
      cutDeck: [
        { t: "A player cuts the deck. The cut is sacred.", e: 'serious', p: 0.98, r: 0.95 },
        { t: "Cut the cards. May the cut favour the bold.", e: 'happy', p: 1.04, r: 1.0 },
        { t: "And the cut is made. No more peeking now.", e: 'playful', p: 1.06, r: 1.0 }
      ],
      drawing: [
        { t: "Drawing three cards. Watch closely.", e: 'serious', p: 1.0, r: 0.98 },
        { t: "One... two... three. Let's see what fate has dealt.", e: 'happy', p: 1.05, r: 0.95 },
        { t: "Here they come. The moment of truth.", e: 'happy', p: 1.06, r: 1.0 }
      ],
      card1: [
        { t: "First card revealed.", e: 'neutral', p: 1.0, r: 1.0 },
        { t: "And the first card is out.", e: 'neutral', p: 1.0, r: 1.0 },
        { t: "Card one. Two more to go.", e: 'neutral', p: 1.02, r: 1.0 }
      ],
      card2: [
        { t: "Second card on the table.", e: 'neutral', p: 1.0, r: 1.0 },
        { t: "There goes the second.", e: 'neutral', p: 1.0, r: 1.0 },
        { t: "Halfway through. One more card.", e: 'playful', p: 1.04, r: 1.0 }
      ],
      card3: [
        { t: "And the final card.", e: 'serious', p: 0.98, r: 0.95 },
        { t: "The last card. Hold your breath.", e: 'serious', p: 1.0, r: 0.95 },
        { t: "Three cards, three destinies.", e: 'happy', p: 1.05, r: 0.98 }
      ],
      win1: [
        { t: "One match! You win at one to one. Well played.", e: 'happy', p: 1.12, r: 1.0 },
        { t: "A single match pays you back double. Congratulations!", e: 'happy', p: 1.1, r: 1.0 },
        { t: "One match, one reward. The deck was kind tonight.", e: 'happy', p: 1.08, r: 1.0 }
      ],
      win2: [
        { t: "Two matches! One to two — that's a handsome payout!", e: 'excited', p: 1.18, r: 1.05 },
        { t: "Two matches! Lady luck is smiling at you!", e: 'excited', p: 1.16, r: 1.05 },
        { t: "Double match, double the joy. Beautiful play!", e: 'excited', p: 1.15, r: 1.0 }
      ],
      win3: [
        { t: "Three matches! One to four! You've hit the jackpot!", e: 'ecstatic', p: 1.25, r: 1.1 },
        { t: "Three of a kind! Incredible! One to four is yours!", e: 'ecstatic', p: 1.22, r: 1.08 },
        { t: "A perfect triple! The deck has crowned you tonight!", e: 'ecstatic', p: 1.2, r: 1.05 }
      ],
      lose: [
        { t: "No matches this round. The cards were shy. Try again?", e: 'sad', p: 0.96, r: 0.95 },
        { t: "Better luck next round. The deck owes you one.", e: 'sad', p: 0.97, r: 0.96 },
        { t: "Not your round. Stay sharp — the next shuffle is fresh.", e: 'neutral', p: 0.98, r: 0.98 }
      ],
      idle: [
        { t: "Take your time. The cards will wait.", e: 'neutral', p: 1.0, r: 0.98 },
        { t: "Six houses. Six chances. Where will you place your trust?", e: 'playful', p: 1.05, r: 1.0 },
        { t: "I'm here when you're ready.", e: 'happy', p: 1.03, r: 1.0 }
      ]
    },
    pick(key) {
      const arr = this.lines[key] || this.lines.idle;
      return arr[Math.floor(Math.random() * arr.length)];
    },
    say(key) {
      const line = this.pick(key);
      Human.setEmotion(line.e);
      Human.setBubble(line.t);
      Voice.speak(line.t, { pitch: line.p, rate: line.r });
      return line;
    },
    sayCustom(text, emotion = 'neutral', pitch = 1.0, rate = 1.0) {
      Human.setEmotion(emotion);
      Human.setBubble(text);
      Voice.speak(text, { pitch, rate });
    }
  };

  // ---------- THE DIGITAL HUMAN ----------
  const Human = {
    root: null,
    parts: {},
    currentPose: 'idle',
    currentEmotion: 'neutral',
    lipSyncTimer: null,
    blinkTimer: null,
    swayTimer: null,
    breatheTimer: null,
    initialized: false,

    // ---------- SVG BUILD ----------
    svgTemplate: `
<svg id="dh-svg" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Skin gradient -->
    <radialGradient id="skinGrad" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fde0c4"/>
      <stop offset="60%" stop-color="#f0c8a0"/>
      <stop offset="100%" stop-color="#d9a878"/>
    </radialGradient>
    <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#3a1a0a"/>
      <stop offset="60%" stop-color="#5c2a14"/>
      <stop offset="100%" stop-color="#2a1208"/>
    </linearGradient>
    <linearGradient id="vestGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1a1a1a"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
    <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fafafa"/>
      <stop offset="100%" stop-color="#c8c8c8"/>
    </linearGradient>
    <linearGradient id="lipGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b03050"/>
      <stop offset="100%" stop-color="#7a1f38"/>
    </linearGradient>
    <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f5a8a8" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#f5a8a8" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="eyeShadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8b5a3c" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#8b5a3c" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>

  <!-- === BODY (chest + shoulders + arms) === -->
  <g id="dh-body">
    <!-- Shoulders / chest base -->
    <path d="M 80 600 L 100 470 Q 200 430 300 470 L 320 600 Z" fill="url(#vestGrad)"/>
    <!-- White shirt -->
    <path d="M 160 470 Q 200 450 240 470 L 235 600 L 165 600 Z" fill="url(#shirtGrad)"/>
    <!-- Black tie -->
    <path d="M 197 470 L 203 470 L 207 510 L 200 530 L 193 510 Z" fill="#1a1a1a"/>
    <!-- Vest lapels -->
    <path d="M 165 470 L 197 470 L 193 530 L 170 510 Z" fill="#0a0a0a"/>
    <path d="M 235 470 L 203 470 L 207 530 L 230 510 Z" fill="#0a0a0a"/>
    <!-- Gold name badge -->
    <circle cx="225" cy="495" r="6" fill="#d4a843" stroke="#8b6914" stroke-width="1"/>
    <!-- Left arm -->
    <g id="dh-arm-left">
      <path d="M 100 470 Q 70 510 65 580 L 95 600 L 110 520 Z" fill="url(#vestGrad)"/>
      <!-- Hand -->
      <ellipse id="dh-hand-left" cx="85" cy="585" rx="18" ry="14" fill="url(#skinGrad)" stroke="#b88a5c" stroke-width="0.5"/>
    </g>
    <!-- Right arm -->
    <g id="dh-arm-right">
      <path d="M 300 470 Q 330 510 335 580 L 305 600 L 290 520 Z" fill="url(#vestGrad)"/>
      <!-- Hand -->
      <ellipse id="dh-hand-right" cx="315" cy="585" rx="18" ry="14" fill="url(#skinGrad)" stroke="#b88a5c" stroke-width="0.5"/>
    </g>
  </g>

  <!-- === NECK === -->
  <g id="dh-neck">
    <path d="M 180 440 L 180 470 Q 200 480 220 470 L 220 440 Z" fill="url(#skinGrad)"/>
    <!-- Neck shadow -->
    <path d="M 180 460 Q 200 470 220 460 L 220 470 Q 200 480 180 470 Z" fill="#c8a070" opacity="0.4"/>
  </g>

  <!-- === HEAD GROUP (rotates for sway) === -->
  <g id="dh-head-group">

    <!-- Hair back (behind head) -->
    <path d="M 130 240 Q 120 180 160 140 Q 200 110 240 140 Q 280 180 270 260 L 280 380 Q 200 400 120 380 Z" fill="url(#hairGrad)"/>

    <!-- Face -->
    <ellipse cx="200" cy="290" rx="78" ry="95" fill="url(#skinGrad)"/>

    <!-- Hair front (framing) -->
    <path d="M 122 260 Q 130 180 180 145 Q 200 135 220 145 Q 270 180 278 260 Q 260 220 230 215 Q 215 200 200 205 Q 185 200 170 215 Q 140 220 122 260 Z" fill="url(#hairGrad)"/>
    <!-- Hair parting -->
    <path d="M 200 145 L 200 220" stroke="#1a0a04" stroke-width="1.5" opacity="0.5"/>

    <!-- Ears -->
    <ellipse cx="124" cy="295" rx="9" ry="14" fill="url(#skinGrad)"/>
    <ellipse cx="276" cy="295" rx="9" ry="14" fill="url(#skinGrad)"/>
    <!-- Earrings -->
    <circle cx="124" cy="310" r="3" fill="#d4a843"/>
    <circle cx="276" cy="310" r="3" fill="#d4a843"/>

    <!-- Eyeshadow -->
    <ellipse cx="170" cy="280" rx="20" ry="8" fill="url(#eyeShadow)"/>
    <ellipse cx="230" cy="280" rx="20" ry="8" fill="url(#eyeShadow)"/>

    <!-- Eyebrows -->
    <path id="dh-brow-left" d="M 152 262 Q 170 256 188 262" stroke="#3a1a0a" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path id="dh-brow-right" d="M 212 262 Q 230 256 248 262" stroke="#3a1a0a" stroke-width="3" fill="none" stroke-linecap="round"/>

    <!-- Eyes (white sclera + iris + pupil) -->
    <g id="dh-eye-left">
      <ellipse cx="170" cy="280" rx="14" ry="9" fill="#ffffff"/>
      <circle id="dh-iris-left" cx="170" cy="280" r="6" fill="#4a2818"/>
      <circle id="dh-pupil-left" cx="170" cy="280" r="3" fill="#000000"/>
      <!-- Eyelid (for blink) -->
      <rect id="dh-lid-left" x="155" y="270" width="32" height="0" fill="url(#skinGrad)"/>
      <!-- Eyelash -->
      <path d="M 156 275 Q 170 271 184 275" stroke="#1a0a04" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </g>
    <g id="dh-eye-right">
      <ellipse cx="230" cy="280" rx="14" ry="9" fill="#ffffff"/>
      <circle id="dh-iris-right" cx="230" cy="280" r="6" fill="#4a2818"/>
      <circle id="dh-pupil-right" cx="230" cy="280" r="3" fill="#000000"/>
      <rect id="dh-lid-right" x="215" y="270" width="32" height="0" fill="url(#skinGrad)"/>
      <path d="M 216 275 Q 230 271 244 275" stroke="#1a0a04" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </g>

    <!-- Nose -->
    <path d="M 200 290 Q 195 315 198 330 Q 200 335 202 330 Q 205 315 200 290" fill="none" stroke="#b88a5c" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="195" cy="332" rx="2.5" ry="1.5" fill="#b88a5c" opacity="0.5"/>
    <ellipse cx="205" cy="332" rx="2.5" ry="1.5" fill="#b88a5c" opacity="0.5"/>

    <!-- Cheeks (blush) -->
    <ellipse cx="150" cy="325" rx="14" ry="9" fill="url(#cheekGrad)"/>
    <ellipse cx="250" cy="325" rx="14" ry="9" fill="url(#cheekGrad)"/>

    <!-- Mouth group (changes with emotion / speech) -->
    <g id="dh-mouth-group">
      <path id="dh-upper-lip" d="M 178 358 Q 200 348 222 358" fill="url(#lipGrad)" stroke="#7a1f38" stroke-width="0.5"/>
      <path id="dh-lower-lip" d="M 178 358 Q 200 372 222 358" fill="url(#lipGrad)" stroke="#7a1f38" stroke-width="0.5"/>
      <path id="dh-mouth-inner" d="M 180 358 Q 200 360 220 358" fill="#5a0f28" opacity="0"/>
    </g>

    <!-- Chin highlight -->
    <ellipse cx="200" cy="375" rx="20" ry="5" fill="#fde8d0" opacity="0.4"/>
  </g>

  <!-- === HELD CARDS (visible during dealing poses) === -->
  <g id="dh-held-cards" opacity="0">
    <rect x="70" y="540" width="50" height="70" rx="4" fill="#1a3a8a" stroke="#d4a843" stroke-width="1.5" transform="rotate(-8 95 575)"/>
    <rect x="280" y="540" width="50" height="70" rx="4" fill="#1a3a8a" stroke="#d4a843" stroke-width="1.5" transform="rotate(8 305 575)"/>
    <text x="95" y="582" text-anchor="middle" fill="#d4a843" font-family="Cinzel Decorative" font-weight="900" font-size="16" transform="rotate(-8 95 575)">A26</text>
    <text x="305" y="582" text-anchor="middle" fill="#d4a843" font-family="Cinzel Decorative" font-weight="900" font-size="16" transform="rotate(8 305 575)">A26</text>
  </g>
</svg>
    `,

    bubbleTemplate: `
<div class="dh-bubble" id="dhBubble">
  <div class="dh-bubble-text" id="dhBubbleText"></div>
  <div class="dh-bubble-tail"></div>
</div>
<div class="dh-emotion-indicator" id="dhEmotion"></div>
<div class="dh-voice-toggle" id="dhVoiceToggle" title="Toggle voice">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
</div>
    `,

    // ---------- INIT ----------
    init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) { console.error('Digital Human: container not found'); return; }
      container.innerHTML = this.svgTemplate + this.bubbleTemplate;
      this.root = container;

      // Cache parts
      this.parts = {
        head: this.root.querySelector('#dh-head-group'),
        body: this.root.querySelector('#dh-body'),
        armLeft: this.root.querySelector('#dh-arm-left'),
        armRight: this.root.querySelector('#dh-arm-right'),
        handLeft: this.root.querySelector('#dh-hand-left'),
        handRight: this.root.querySelector('#dh-hand-right'),
        browLeft: this.root.querySelector('#dh-brow-left'),
        browRight: this.root.querySelector('#dh-brow-right'),
        eyeLeft: this.root.querySelector('#dh-eye-left'),
        eyeRight: this.root.querySelector('#dh-eye-right'),
        irisLeft: this.root.querySelector('#dh-iris-left'),
        irisRight: this.root.querySelector('#dh-iris-right'),
        pupilLeft: this.root.querySelector('#dh-pupil-left'),
        pupilRight: this.root.querySelector('#dh-pupil-right'),
        lidLeft: this.root.querySelector('#dh-lid-left'),
        lidRight: this.root.querySelector('#dh-lid-right'),
        mouthGroup: this.root.querySelector('#dh-mouth-group'),
        upperLip: this.root.querySelector('#dh-upper-lip'),
        lowerLip: this.root.querySelector('#dh-lower-lip'),
        mouthInner: this.root.querySelector('#dh-mouth-inner'),
        heldCards: this.root.querySelector('#dh-held-cards')
      };

      this.initialized = true;
      Voice.init();
      this.startBlinking();
      this.startSwaying();
      this.startBreathing();
      this.bindVoiceToggle();

      // Idle look-around for pupils
      this.startLookingAround();
    },

    bindVoiceToggle() {
      const btn = document.getElementById('dhVoiceToggle');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const on = Voice.toggle();
        btn.classList.toggle('muted', !on);
      });
    },

    // ---------- BLINK ----------
    startBlinking() {
      const blink = () => {
        if (!this.initialized) return;
        // Close lids
        this.parts.lidLeft.setAttribute('height', '18');
        this.parts.lidLeft.setAttribute('y', '271');
        this.parts.lidRight.setAttribute('height', '18');
        this.parts.lidRight.setAttribute('y', '271');
        setTimeout(() => {
          this.parts.lidLeft.setAttribute('height', '0');
          this.parts.lidRight.setAttribute('height', '0');
        }, 120);
        // Next blink in 2.5–6s
        setTimeout(blink, 2500 + Math.random() * 3500);
      };
      setTimeout(blink, 1500);
    },

    // ---------- SWAY (head tilt animation) ----------
    startSwaying() {
      let phase = 0;
      this.swayTimer = setInterval(() => {
        if (!this.initialized) return;
        phase += 0.04;
        const tilt = Math.sin(phase) * 2.5;
        const shift = Math.sin(phase * 0.7) * 1.5;
        this.parts.head.setAttribute('transform', `rotate(${tilt} 200 350) translate(${shift} 0)`);
      }, 80);
    },

    // ---------- BREATHE (subtle chest scale) ----------
    startBreathing() {
      let phase = 0;
      this.breatheTimer = setInterval(() => {
        if (!this.initialized) return;
        phase += 0.03;
        const scale = 1 + Math.sin(phase) * 0.008;
        this.parts.body.setAttribute('transform', `scale(${scale} 1) translate(${(1-scale)*200} 0)`);
      }, 100);
    },

    // ---------- LOOK AROUND (pupil movement) ----------
    startLookingAround() {
      const look = () => {
        if (!this.initialized) return;
        const dx = (Math.random() - 0.5) * 4;
        const dy = (Math.random() - 0.5) * 3;
        this.movePupils(dx, dy);
        setTimeout(look, 1500 + Math.random() * 2500);
      };
      setTimeout(look, 2000);
    },

    movePupils(dx, dy) {
      this.parts.irisLeft.setAttribute('cx', 170 + dx);
      this.parts.irisLeft.setAttribute('cy', 280 + dy);
      this.parts.pupilLeft.setAttribute('cx', 170 + dx);
      this.parts.pupilLeft.setAttribute('cy', 280 + dy);
      this.parts.irisRight.setAttribute('cx', 230 + dx);
      this.parts.irisRight.setAttribute('cy', 280 + dy);
      this.parts.pupilRight.setAttribute('cx', 230 + dx);
      this.parts.pupilRight.setAttribute('cy', 280 + dy);
    },

    // ---------- EMOTIONS ----------
    setEmotion(emotion) {
      this.currentEmotion = emotion;
      const e = document.getElementById('dhEmotion');
      if (e) {
        e.className = 'dh-emotion-indicator ' + emotion;
        e.textContent = emotion;
      }
      const U = this.parts.upperLip;
      const L = this.parts.lowerLip;
      const BL = this.parts.browLeft;
      const BR = this.parts.browRight;
      const ML = this.parts.mouthLeft; // unused, kept for future
      switch (emotion) {
        case 'happy':
          U.setAttribute('d', 'M 175 358 Q 200 345 225 358');
          L.setAttribute('d', 'M 175 358 Q 200 378 225 358');
          BL.setAttribute('d', 'M 152 260 Q 170 254 188 260');
          BR.setAttribute('d', 'M 212 260 Q 230 254 248 260');
          break;
        case 'excited':
          U.setAttribute('d', 'M 173 355 Q 200 340 227 355');
          L.setAttribute('d', 'M 173 355 Q 200 385 227 355');
          BL.setAttribute('d', 'M 152 256 Q 170 250 188 256');
          BR.setAttribute('d', 'M 212 256 Q 230 250 248 256');
          break;
        case 'ecstatic':
          U.setAttribute('d', 'M 170 352 Q 200 335 230 352');
          L.setAttribute('d', 'M 170 352 Q 200 395 230 352');
          BL.setAttribute('d', 'M 152 252 Q 170 246 188 252');
          BR.setAttribute('d', 'M 212 252 Q 230 246 248 252');
          break;
        case 'sad':
          U.setAttribute('d', 'M 178 362 Q 200 358 222 362');
          L.setAttribute('d', 'M 178 362 Q 200 370 222 362');
          BL.setAttribute('d', 'M 152 266 Q 170 260 188 264');
          BR.setAttribute('d', 'M 212 264 Q 230 260 248 266');
          break;
        case 'serious':
          U.setAttribute('d', 'M 178 360 Q 200 355 222 360');
          L.setAttribute('d', 'M 178 360 Q 200 365 222 360');
          BL.setAttribute('d', 'M 152 261 Q 170 257 188 261');
          BR.setAttribute('d', 'M 212 261 Q 230 257 248 261');
          break;
        case 'playful':
          U.setAttribute('d', 'M 175 357 Q 200 343 225 357');
          L.setAttribute('d', 'M 175 357 Q 200 376 225 357');
          BL.setAttribute('d', 'M 152 258 Q 170 252 188 258');
          BR.setAttribute('d', 'M 212 258 Q 230 252 248 258');
          break;
        default: // neutral
          U.setAttribute('d', 'M 178 358 Q 200 350 222 358');
          L.setAttribute('d', 'M 178 358 Q 200 368 222 358');
          BL.setAttribute('d', 'M 152 262 Q 170 256 188 262');
          BR.setAttribute('d', 'M 212 262 Q 230 256 248 262');
      }
    },

    // ---------- POSE (full body posture + arms) ----------
    setPose(pose) {
      this.currentPose = pose;
      const AL = this.parts.armLeft;
      const AR = this.parts.armRight;
      const HC = this.parts.heldCards;
      switch (pose) {
        case 'idle':
          AL.setAttribute('transform', 'rotate(0 100 470)');
          AR.setAttribute('transform', 'rotate(0 300 470)');
          HC.setAttribute('opacity', '0');
          break;
        case 'shuffling':
          // Hands come together in front
          AL.setAttribute('transform', 'rotate(-15 100 470)');
          AR.setAttribute('transform', 'rotate(15 300 470)');
          HC.setAttribute('opacity', '0');
          // Add a little shuffle wobble
          this.parts.body.setAttribute('transform', 'translate(0 0)');
          break;
        case 'cutting':
          // One hand lifts to cut
          AL.setAttribute('transform', 'rotate(-25 100 470)');
          AR.setAttribute('transform', 'rotate(20 300 470)');
          HC.setAttribute('opacity', '0');
          break;
        case 'dealing':
          // Both arms forward, holding cards
          AL.setAttribute('transform', 'rotate(-10 100 470)');
          AR.setAttribute('transform', 'rotate(10 300 470)');
          HC.setAttribute('opacity', '1');
          break;
        case 'reveal-win':
          // Arms raised in triumph
          AL.setAttribute('transform', 'rotate(-35 100 470)');
          AR.setAttribute('transform', 'rotate(35 300 470)');
          HC.setAttribute('opacity', '0');
          break;
        case 'reveal-lose':
          // Arms slightly drooped
          AL.setAttribute('transform', 'rotate(5 100 470)');
          AR.setAttribute('transform', 'rotate(-5 300 470)');
          HC.setAttribute('opacity', '0');
          break;
      }
    },

    // ---------- LIP-SYNC ----------
    lipSyncStart(opts) {
      // Animate mouth shape rapidly to simulate talking
      let frame = 0;
      const shapes = [
        'M 178 358 Q 200 352 222 358', // closed
        'M 178 358 Q 200 350 222 358 Q 200 364 178 358', // small
        'M 178 358 Q 200 348 222 358 Q 200 372 178 358', // medium
        'M 178 358 Q 200 350 222 358 Q 200 366 178 358'  // medium-small
      ];
      this.lipSyncTimer = setInterval(() => {
        if (!this.initialized) return;
        const shape = shapes[frame % shapes.length];
        // Apply while preserving current emotion's upper lip direction
        this.parts.lowerLip.setAttribute('d', `M 178 358 Q 200 ${358 + (frame % 3) * 4 + 6} 222 358`);
        this.parts.upperLip.setAttribute('d', `M 178 358 Q 200 ${358 - (frame % 3) * 2 - 2} 222 358`);
        this.parts.mouthInner.setAttribute('opacity', '0.6');
        this.parts.mouthInner.setAttribute('d', `M 180 358 Q 200 ${358 + (frame % 3) * 3 + 2} 220 358`);
        frame++;
      }, 90);
    },
    lipSyncStop() {
      if (this.lipSyncTimer) { clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
      if (this.initialized) {
        this.parts.mouthInner.setAttribute('opacity', '0');
        // Restore emotion mouth
        this.setEmotion(this.currentEmotion);
      }
    },
    lipSync(text, opts = {}) {
      // Fallback lip-sync when voice is disabled — simulate duration based on text length
      const duration = Math.max(800, text.length * 60);
      this.lipSyncStart(opts);
      setTimeout(() => this.lipSyncStop(), duration);
    },

    // ---------- SPEECH BUBBLE ----------
    setBubble(text) {
      const bubble = document.getElementById('dhBubble');
      const bubbleText = document.getElementById('dhBubbleText');
      if (!bubble || !bubbleText) return;
      bubbleText.textContent = text;
      bubble.classList.remove('show');
      // restart animation
      void bubble.offsetWidth;
      bubble.classList.add('show');
    },

    // ---------- HIGH-LEVEL SAY ----------
    say(key) {
      return Dialogue.say(key);
    },
    sayCustom(text, emotion, pitch, rate) {
      return Dialogue.sayCustom(text, emotion, pitch, rate);
    },

    // ---------- GESTURE (one-shot arm wave) ----------
    gesture(type) {
      switch (type) {
        case 'wave':
          this.parts.armRight.setAttribute('transform', 'rotate(-60 300 470)');
          setTimeout(() => this.parts.armRight.setAttribute('transform', 'rotate(-50 300 470)'), 150);
          setTimeout(() => this.parts.armRight.setAttribute('transform', 'rotate(-65 300 470)'), 300);
          setTimeout(() => {
            this.parts.armRight.setAttribute('transform', 'rotate(0 300 470)');
          }, 600);
          break;
        case 'deal-card':
          // Right arm flicks out to deal a card
          this.parts.armRight.setAttribute('transform', 'rotate(-15 300 470)');
          setTimeout(() => this.parts.armRight.setAttribute('transform', 'rotate(15 300 470)'), 200);
          break;
      }
    },

    destroy() {
      if (this.swayTimer) clearInterval(this.swayTimer);
      if (this.breatheTimer) clearInterval(this.breatheTimer);
      if (this.lipSyncTimer) clearInterval(this.lipSyncTimer);
      Voice.cancel();
      this.initialized = false;
    }
  };

  // ---------- EXPORT ----------
  global.DigitalHuman = {
    init: (id) => Human.init(id),
    say: (key) => Human.say(key),
    sayCustom: (t, e, p, r) => Human.sayCustom(t, e, p, r),
    setPose: (p) => Human.setPose(p),
    setEmotion: (e) => Human.setEmotion(e),
    setBubble: (t) => Human.setBubble(t),
    gesture: (g) => Human.gesture(g),
    movePupils: (x, y) => Human.movePupils(x, y),
    voiceOn: () => Voice.enabled,
    toggleVoice: () => Voice.toggle()
  };

})(window);
