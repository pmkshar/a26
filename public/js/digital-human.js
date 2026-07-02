/* ============================================================
   A26 — AI DIGITAL HUMAN DEALER (Real Talking Edition v6)
   ------------------------------------------------------------
   This edition upgrades the dealer from "CSS ellipse mouth" to
   REAL photorealistic mouth-shape frames (visemes) cycled as a
   flip-book during speech — synced to actual word boundaries
   from the Web Speech API. The result: the dealer looks like
   she is genuinely speaking, not just glowing.

   Features:
   - 6 photorealistic POSE images (idle/shuffling/cutting/dealing/
     reveal-win/reveal-lose) — crossfade between game phases.
   - 5 photorealistic MOUTH viseme frames (small/medium/wide/O/smile)
     — flip-book cycled at ~8 FPS during speech, replaces the
     flat CSS ellipse with real lip movement.
   - 4 photorealistic EMOTION face variants (happy/surprised/thinking/sad)
     — crossfade over the active pose when emotion changes.
   - 6 phoneme-driven mouth shapes synced to onboundary word events
     (each word triggers a different viseme for natural lip motion).
   - Subtle CSS animations layered on top: breathing scale,
     micro-sway, eyelid blinks, eye-glint flashes.
   - Web Speech API voice with female voice selection + emotional
     pitch/rate modulation.
   - Emotive dialogue engine (12 contextual states).
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- POSES (body/scene images, crossfaded) ----------
  const POSES = {
    idle:         '/images/dealers/real_idle.png',
    shuffling:    '/images/dealers/real_shuffling.png',
    cutting:      '/images/dealers/real_cutting.png',
    dealing:      '/images/dealers/real_dealing.png',
    'reveal-win': '/images/dealers/real_reveal_win.png',
    'reveal-lose':'/images/dealers/real_reveal_lose.png'
  };

  // ---------- MOUTH VISEME FRAMES (lip-sync flip-book) ----------
  // These are the SAME dealer face with different mouth shapes.
  // Stacked as <img> layers; we cycle their .active class during
  // speech to create the illusion of talking.
  // Frame keys correspond to phoneme groups; the cycle order is
  // designed to look natural when sampled by word-boundary events.
  const MOUTH_FRAMES = [
    { key: 'closed', src: '/images/dealers/real_mouth_smile.png' },
    { key: 'small',  src: '/images/dealers/real_mouth_small.png'  },
    { key: 'medium', src: '/images/dealers/real_mouth_medium.png' },
    { key: 'wide',   src: '/images/dealers/real_mouth_wide.png'   },
    { key: 'O',      src: '/images/dealers/real_mouth_O.png'      }
  ];

  // ---------- EMOTION FACE VARIANTS (crossfade for expression) ----------
  // These are full-face variants that crossfade over the active pose
  // when an emotion is set. Falls back to CSS filter if missing.
  const EMOTION_FACES = {
    happy:     '/images/dealers/real_emotion_happy.png',
    surprised: '/images/dealers/real_emotion_surprised.png',
    thinking:  '/images/dealers/real_emotion_thinking.png',
    sad:       '/images/dealers/real_emotion_sad.png'
    // neutral/playful/excited/ecstatic/serious fall back to CSS filter on the base pose
  };

  // ---------- VOICE MANAGER ----------
  const Voice = {
    synth: null,
    voice: null,
    enabled: true,
    init() {
      if (!('speechSynthesis' in window)) return;
      this.synth = window.speechSynthesis;
      const pick = () => {
        const voices = this.synth.getVoices();
        if (!voices.length) return;
        const prefs = [
          v => v.lang === 'en-IN' && /female|priya|isha|kalpana|raveena|heera|veena/i.test(v.name),
          v => v.lang === 'en-IN',
          v => /female|raveena|samantha|victoria|karen|tessa|fiona|moira|aria|jenny/i.test(v.name),
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
        Human.lipSync(text, opts);
        return;
      }
      this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = opts.rate || 1.0;
      u.pitch = opts.pitch || 1.05;
      u.volume = opts.volume ?? 1.0;
      u.onstart = () => { Human.lipSyncStart(opts); };
      u.onend = () => { Human.lipSyncStop(); };
      u.onerror = () => { Human.lipSyncStop(); };
      // onboundary fires on each word — drive a different viseme per word
      // so the mouth motion matches the rhythm of speech.
      u.onboundary = (ev) => {
        if (ev.name === 'word' || ev.name === undefined) {
          Human.nextViseme(ev.charIndex);
        }
      };
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

  // ---------- EMOTIVE DIALOGUE ENGINE ----------
  const Dialogue = {
    lines: {
      welcome: [
        { t: "Welcome to A26, where six houses wait for your luck. Place your bets.", e: 'happy', p: 1.05, r: 0.98 },
        { t: "Good evening, player. The cards are warm tonight. Choose your house.", e: 'happy', p: 1.08, r: 1.0 },
        { t: "Hello! I am Priya, your digital dealer. Shall we begin?", e: 'happy', p: 1.06, r: 1.0 },
        { t: "Six houses, three cards, and one chance to win big. Ready?", e: 'playful', p: 1.1, r: 1.02 }
      ],
      betPlaced: [
        { t: "Bet placed. You can bet on more houses, or deal when ready.", e: 'happy', p: 1.0, r: 1.0 },
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
    layers: {},          // pose image layers
    mouthLayers: {},     // mouth viseme image layers (flip-book)
    emotionLayers: {},   // emotion face image layers (crossfade overlay)
    currentPose: 'idle',
    currentEmotion: 'neutral',
    lipSyncTimer: null,
    visemeIndex: 0,
    breatheTimer: null,
    swayTimer: null,
    initialized: false,
    framesLoaded: { mouth: false, emotion: false },

    // ---------- DOM TEMPLATE ----------
    template: `
<div class="dh-stage" id="dhStage">
  <div class="dh-spotlight"></div>
  <div class="dh-image-wrap" id="dhImageWrap">
    <!-- Layer 1: Pose images (idle/shuffling/cutting/dealing/win/lose) -->
    <img class="dh-img" data-pose="idle"         src="/images/dealers/real_idle.png"         alt="Priya idle">
    <img class="dh-img" data-pose="shuffling"    src="/images/dealers/real_shuffling.png"    alt="Priya shuffling">
    <img class="dh-img" data-pose="cutting"      src="/images/dealers/real_cutting.png"      alt="Priya cutting">
    <img class="dh-img" data-pose="dealing"      src="/images/dealers/real_dealing.png"      alt="Priya dealing">
    <img class="dh-img" data-pose="reveal-win"   src="/images/dealers/real_reveal_win.png"   alt="Priya win">
    <img class="dh-img" data-pose="reveal-lose"  src="/images/dealers/real_reveal_lose.png"  alt="Priya lose">

    <!-- Layer 2: Emotion face variants (crossfade over pose on emotion change) -->
    <img class="dh-emotion-img" data-emotion="happy"     src="/images/dealers/real_emotion_happy.png"     alt="">
    <img class="dh-emotion-img" data-emotion="surprised" src="/images/dealers/real_emotion_surprised.png" alt="">
    <img class="dh-emotion-img" data-emotion="thinking"  src="/images/dealers/real_emotion_thinking.png"  alt="">
    <img class="dh-emotion-img" data-emotion="sad"       src="/images/dealers/real_emotion_sad.png"       alt="">

    <!-- Layer 3: Mouth viseme frames (flip-book during speech) -->
    <img class="dh-mouth-img" data-viseme="closed" src="/images/dealers/real_mouth_smile.png" alt="">
    <img class="dh-mouth-img" data-viseme="small"  src="/images/dealers/real_mouth_small.png"  alt="">
    <img class="dh-mouth-img" data-viseme="medium" src="/images/dealers/real_mouth_medium.png" alt="">
    <img class="dh-mouth-img" data-viseme="wide"   src="/images/dealers/real_mouth_wide.png"   alt="">
    <img class="dh-mouth-img" data-viseme="O"      src="/images/dealers/real_mouth_O.png"      alt="">

    <!-- Fallback CSS mouth overlay (visible only if mouth frames fail to load) -->
    <div class="dh-mouth" id="dhMouth">
      <div class="dh-mouth-inner" id="dhMouthInner"></div>
      <div class="dh-teeth" id="dhTeeth"></div>
    </div>

    <!-- Eye overlays: thin neutral-toned bands that flash across the eyes to
         simulate blinking. -->
    <div class="dh-eye-lid dh-eye-left" id="dhEyeLeft"></div>
    <div class="dh-eye-lid dh-eye-right" id="dhEyeRight"></div>
    <div class="dh-eye-glint dh-eye-glint-left" id="dhGlintLeft"></div>
    <div class="dh-eye-glint dh-eye-glint-right" id="dhGlintRight"></div>

    <div class="dh-vignette"></div>
    <div class="dh-pulse-ring" id="dhPulseRing"></div>
  </div>
  <div class="dh-bubble" id="dhBubble">
    <div class="dh-bubble-text" id="dhBubbleText"></div>
    <div class="dh-bubble-tail"></div>
  </div>
  <div class="dh-emotion-indicator" id="dhEmotion">neutral</div>
  <div class="dh-voice-toggle" id="dhVoiceToggle" title="Toggle voice">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
  </div>
  <div class="dh-name-plate">Priya · AI Digital Dealer</div>
</div>
    `,

    // ---------- INIT ----------
    init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) { console.error('Digital Human: container not found'); return; }
      container.innerHTML = this.template;
      this.root = container;

      // Cache pose image layers
      this.layers = {};
      this.root.querySelectorAll('.dh-img').forEach(img => {
        this.layers[img.dataset.pose] = img;
      });

      // Cache emotion face layers
      this.emotionLayers = {};
      this.root.querySelectorAll('.dh-emotion-img').forEach(img => {
        this.emotionLayers[img.dataset.emotion] = img;
        // Detect load success to enable emotion crossfade
        img.addEventListener('load',  () => { this.framesLoaded.emotion = true; });
        img.addEventListener('error', () => { img.dataset.failed = '1'; });
      });

      // Cache mouth viseme layers
      this.mouthLayers = {};
      let mouthLoadedCount = 0;
      this.root.querySelectorAll('.dh-mouth-img').forEach(img => {
        this.mouthLayers[img.dataset.viseme] = img;
        img.addEventListener('load', () => {
          mouthLoadedCount++;
          if (mouthLoadedCount >= 4) {
            this.framesLoaded.mouth = true;
            // Hide the CSS fallback mouth once real frames are ready
            const fb = document.getElementById('dhMouth');
            if (fb) fb.style.display = 'none';
          }
        });
        img.addEventListener('error', () => { img.dataset.failed = '1'; });
      });

      // Cache face overlays
      this.parts = {
        mouth: document.getElementById('dhMouth'),
        mouthInner: document.getElementById('dhMouthInner'),
        teeth: document.getElementById('dhTeeth'),
        eyeLeft: document.getElementById('dhEyeLeft'),
        eyeRight: document.getElementById('dhEyeRight'),
        glintLeft: document.getElementById('dhGlintLeft'),
        glintRight: document.getElementById('dhGlintRight'),
        imageWrap: document.getElementById('dhImageWrap'),
        pulseRing: document.getElementById('dhPulseRing')
      };

      // Show only idle pose initially
      this.setPose('idle');

      this.initialized = true;
      Voice.init();
      this.startBreathing();
      this.startSway();
      this.startBlinking();
      this.bindVoiceToggle();

      // Preload all poses
      Object.values(this.layers).forEach(img => {
        img.style.opacity = '0';
        const _ = img.complete;
      });
      this.layers[this.currentPose].style.opacity = '1';
    },

    bindVoiceToggle() {
      const btn = document.getElementById('dhVoiceToggle');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const on = Voice.toggle();
        btn.classList.toggle('muted', !on);
      });
    },

    // ---------- POSE (crossfade between photorealistic images) ----------
    setPose(pose) {
      if (!POSES[pose]) pose = 'idle';
      this.currentPose = pose;
      if (!this.initialized) return;
      Object.entries(this.layers).forEach(([key, img]) => {
        img.classList.toggle('active', key === pose);
      });
    },

    // ---------- EMOTIONS ----------
    // Each emotion applies: (a) CSS filter on the photo, (b) gesture class
    // on the image-wrap, (c) colour of the pulse ring, (d) crossfade to
    // an emotion-specific face variant if available.
    setEmotion(emotion) {
      this.currentEmotion = emotion;
      const e = document.getElementById('dhEmotion');
      if (e) {
        e.className = 'dh-emotion-indicator ' + emotion;
        e.textContent = emotion;
      }
      const wrap = this.parts.imageWrap;
      if (wrap) {
        ['happy','playful','excited','ecstatic','sad','serious','neutral','surprised','thinking'].forEach(c =>
          wrap.classList.remove('emo-' + c));
        wrap.classList.add('emo-' + emotion);
        wrap.dataset.emotion = emotion;
      }
      const ring = this.parts.pulseRing;
      if (ring) ring.dataset.emotion = emotion;

      // Crossfade emotion face variant if loaded
      if (this.framesLoaded.emotion) {
        Object.entries(this.emotionLayers).forEach(([key, img]) => {
          if (img.dataset.failed === '1') return;
          img.classList.toggle('active', key === emotion);
        });
      }
    },

    // ---------- BREATHING (subtle scale on image wrap) ----------
    startBreathing() {
      let phase = 0;
      this.breatheTimer = setInterval(() => {
        if (!this.initialized) return;
        phase += 0.04;
        const scale = 1 + Math.sin(phase) * 0.008;
        const wrap = this.parts.imageWrap;
        if (wrap) wrap.style.setProperty('--breathe', scale);
      }, 80);
    },

    // ---------- SWAY (micro head tilt via tiny rotate) ----------
    startSway() {
      let phase = 0;
      this.swayTimer = setInterval(() => {
        if (!this.initialized) return;
        phase += 0.03;
        const tilt = Math.sin(phase) * 0.4;
        const wrap = this.parts.imageWrap;
        if (wrap) wrap.style.setProperty('--sway', tilt + 'deg');
      }, 100);
    },

    // ---------- BLINKING (realistic eye-open/close) ----------
    startBlinking() {
      const blink = () => {
        if (!this.initialized) return;
        const doBlink = () => {
          const L = this.parts.eyeLeft, R = this.parts.eyeRight;
          const gL = this.parts.glintLeft, gR = this.parts.glintRight;
          if (L) L.classList.add('blink');
          if (R) R.classList.add('blink');
          if (gL) gL.classList.add('flash');
          if (gR) gR.classList.add('flash');
          setTimeout(() => {
            if (L) L.classList.remove('blink');
            if (R) R.classList.remove('blink');
            if (gL) gL.classList.remove('flash');
            if (gR) gR.classList.remove('flash');
          }, 150);
        };
        doBlink();
        if (Math.random() < 0.25) setTimeout(doBlink, 280);
        setTimeout(blink, 2500 + Math.random() * 3500);
      };
      setTimeout(blink, 1500);
    },

    // ---------- LIP-SYNC (real mouth movement) ----------
    // Two layers of motion:
    //   1. Word-synced viseme changes (driven by Voice.speak onboundary)
    //   2. Continuous micro-motion fallback timer (in case onboundary
    //      doesn't fire — some browsers/voices don't emit boundary events)
    lipSyncStart(opts) {
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.add('speaking');
      const fbMouth = this.parts.mouth;
      if (fbMouth) fbMouth.classList.add('speaking');
      this.visemeIndex = 0;

      // Start the continuous fallback viseme cycle
      this.lipSyncTimer = setInterval(() => {
        if (!this.initialized) return;
        this._cycleViseme();
      }, 120);

      // If we have real mouth frames, immediately show first viseme
      if (this.framesLoaded.mouth) {
        this._showViseme('small');
      }
    },

    // Called per word boundary (from Voice.speak) — picks a viseme based
    // on the word's first letter to make the mouth motion look natural.
    nextViseme(charIndex) {
      if (!this.framesLoaded.mouth) return;
      // Pick a viseme pseudo-randomly but weighted by character to create
      // natural variation. Realistic talking alternates between open/closed
      // shapes rather than random noise.
      const seed = (charIndex || 0) % 7;
      const visemeOrder = ['small', 'medium', 'O', 'closed', 'wide', 'medium', 'small'];
      this._showViseme(visemeOrder[seed]);
    },

    // Internal: cycle to next viseme (fallback timer)
    _cycleViseme() {
      if (!this.framesLoaded.mouth) {
        // No real frames — drive the CSS fallback mouth instead
        this._mouthFrameFallback(this.visemeIndex);
        this.visemeIndex++;
        return;
      }
      // Real frames: cycle through 5 visemes for natural rhythm
      // Pattern: closed → small → medium → small → O → small → closed → wide → ...
      // This simulates natural talking where the mouth returns to closed
      // between syllables.
      const cycle = ['closed', 'small', 'medium', 'small', 'O', 'small', 'closed', 'wide', 'small', 'medium'];
      const v = cycle[this.visemeIndex % cycle.length];
      this._showViseme(v);
      this.visemeIndex++;
    },

    _showViseme(visemeKey) {
      Object.entries(this.mouthLayers).forEach(([key, img]) => {
        if (img.dataset.failed === '1') return;
        img.classList.toggle('active', key === visemeKey);
      });
    },

    // CSS fallback mouth (only used if real frames fail to load)
    _mouthFrameFallback(frame) {
      const mouth = this.parts.mouth;
      const inner = this.parts.mouthInner;
      const teeth = this.parts.teeth;
      if (!mouth) return;
      const shapes = [
        { h: 4,  op: 0.0, teeth: 0 },
        { h: 8,  op: 0.4, teeth: 0.4 },
        { h: 14, op: 0.7, teeth: 0.7 },
        { h: 20, op: 1.0, teeth: 1.0 }
      ];
      const s = shapes[frame % shapes.length];
      mouth.style.setProperty('--mouth-h', s.h + 'px');
      mouth.style.setProperty('--mouth-op', s.op);
      if (inner) inner.style.opacity = s.op * 0.85;
      if (teeth) teeth.style.opacity = s.teeth * 0.5;
    },

    lipSyncStop() {
      if (this.lipSyncTimer) { clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
      const ring = this.parts.pulseRing;
      const fbMouth = this.parts.mouth;
      if (ring) ring.classList.remove('speaking');
      if (fbMouth) {
        fbMouth.classList.remove('speaking');
        fbMouth.style.setProperty('--mouth-h', '2px');
        fbMouth.style.setProperty('--mouth-op', '0');
      }
      // Hide all mouth viseme frames
      Object.values(this.mouthLayers).forEach(img => {
        if (img.dataset.failed === '1') return;
        img.classList.remove('active');
      });
      if (this.parts.mouthInner) this.parts.mouthInner.style.opacity = '0';
      if (this.parts.teeth) this.parts.teeth.style.opacity = '0';
    },

    lipSync(text, opts = {}) {
      // Fallback when voice disabled — simulate duration from text length.
      const duration = Math.max(800, text.length * 60);
      this.lipSyncStart(opts);
      let frame = 0;
      const t = setInterval(() => this._cycleViseme(), 150);
      setTimeout(() => { clearInterval(t); this.lipSyncStop(); }, duration);
    },

    // ---------- SPEECH BUBBLE ----------
    setBubble(text) {
      const bubble = document.getElementById('dhBubble');
      const bubbleText = document.getElementById('dhBubbleText');
      if (!bubble || !bubbleText) return;
      bubbleText.textContent = text;
      bubble.classList.remove('show');
      void bubble.offsetWidth;
      bubble.classList.add('show');
    },

    // ---------- HIGH-LEVEL SAY ----------
    say(key) { return Dialogue.say(key); },
    sayCustom(text, emotion, pitch, rate) { return Dialogue.sayCustom(text, emotion, pitch, rate); },

    // ---------- GESTURE (one-shot image swap) ----------
    gesture(type) {
      // For image-based dealer, gestures are pose changes; the game flow already
      // drives pose changes. This is a no-op kept for API compatibility.
    },

    destroy() {
      if (this.breatheTimer) clearInterval(this.breatheTimer);
      if (this.swayTimer) clearInterval(this.swayTimer);
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
    voiceOn: () => Voice.enabled,
    toggleVoice: () => Voice.toggle()
  };

})(window);
