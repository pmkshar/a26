/* ============================================================
   A26 — AI DIGITAL HUMAN DEALER (Live Girl Edition v9)
   ------------------------------------------------------------
   Redesigned to look like a REAL LIVE GIRL sitting in the
   dealer's cabin — no left/right image motion, no face
   swapping, no overlay flicker.

   Key design decisions:
   1. ONE single photorealistic portrait image is shown at all
      times. It never changes, never tilts, never slides left
      or right. The viewer sees one consistent human face.
   2. Natural humanoid micro-movements are applied to the SAME
      image via CSS transforms: slow breathing (subtle vertical
      scale), occasional micro head-nods (1-2px), and lifelike
      eye blinks. No pose-based image swaps.
   3. Lip-sync uses a soft radial-gradient overlay positioned
      over the mouth region — a smooth dark-to-transparent
      ellipse that scales vertically with each syllable. This
      reads as "the mouth is opening" on a real photo, much
      more naturally than a hard-edged SVG shape would.
   4. Voice uses ONE utterance at a time. speechSynthesis.cancel()
      is called before every new utterance so narration never
      overlaps. sayAndWait() resolves on utterance end.
   5. Game announcements (betting closed, cutting the cards)
      are spoken at the right phase transitions.

   Architecture:
   - ONE base portrait: /images/dealers/real_idle.png
   - .dh-face-img        : the visible dealer photo
   - .dh-mouth-soft      : soft radial-gradient overlay (lip-sync)
   - .dh-eye-lid.l/r     : thin eyelid bands (blink)
   - Web Speech API      : en-IN female, rate 0.82, no overlap
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- SINGLE FACE IMAGE ----------
  // Only one portrait is ever shown. The same face stays on screen
  // for the entire session — no swapping, no flicker.
  const FACE_IMAGE = '/images/dealers/real_idle.png';

  // ---------- VOICE MANAGER (single utterance, no overlap) ----------
  const Voice = {
    synth: null,
    voice: null,
    enabled: true,
    currentUtterance: null,
    onEndCallback: null,
    init() {
      if (!('speechSynthesis' in window)) return;
      this.synth = window.speechSynthesis;
      const pick = () => {
        const voices = this.synth.getVoices();
        if (!voices.length) return;
        const prefs = [
          v => v.lang === 'en-IN' && /female|priya|isha|kalpana|raveena|heera|veena/i.test(v.name),
          v => v.lang === 'en-IN',
          v => /raveena|priya|isha|kalpana|heera|veena/i.test(v.name),
          v => v.lang === 'en-GB' && /female|libby|serena|mia|sonia/i.test(v.name),
          v => v.lang === 'en-US' && /female|aria|jenny|michelle|zira/i.test(v.name),
          v => /female/i.test(v.name) && v.lang && v.lang.startsWith('en'),
          v => v.lang && v.lang.startsWith('en')
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
    // Speak a single text as ONE utterance. Cancels any current speech
    // so narration never overlaps. Returns a Promise resolved on end.
    speak(text, opts = {}) {
      // Resolve any pending onEndCallback (previous speech getting cut off)
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }

      if (!this.synth || !this.enabled) {
        // Voice disabled — run a timed lip-sync fallback
        Human.lipSyncStart(opts);
        const duration = Math.max(1200, text.length * 70);
        return new Promise(resolve => setTimeout(() => {
          Human.lipSyncStop();
          resolve();
        }, duration));
      }

      // Cancel any current speech synth BEFORE building the new utterance
      this.synth.cancel();

      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate   = opts.rate   != null ? opts.rate   : 0.82;
      u.pitch  = opts.pitch  != null ? opts.pitch  : 0.98;
      u.volume = opts.volume != null ? opts.volume : 1.0;

      this.currentUtterance = u;

      u.onstart = () => { Human.lipSyncStart(opts); };
      u.onend = () => {
        Human.lipSyncStop();
        this.currentUtterance = null;
        if (this.onEndCallback) {
          const cb = this.onEndCallback;
          this.onEndCallback = null;
          cb();
        }
      };
      u.onerror = () => {
        Human.lipSyncStop();
        this.currentUtterance = null;
        if (this.onEndCallback) {
          const cb = this.onEndCallback;
          this.onEndCallback = null;
          cb();
        }
      };
      u.onboundary = (ev) => {
        if (ev.name === 'word' || ev.name === undefined) {
          Human.pulseMouth();
        }
      };

      // Set up the end promise BEFORE calling speak
      const endPromise = new Promise(resolve => {
        this.onEndCallback = resolve;
      });

      // Small delay to let cancel() take effect before speaking
      setTimeout(() => {
        if (this.synth) this.synth.speak(u);
      }, 60);

      return endPromise;
    },
    async speakAndWait(text, opts = {}) {
      return this.speak(text, opts);
    },
    cancel() {
      if (this.synth) this.synth.cancel();
      this.currentUtterance = null;
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }
      Human.lipSyncStop();
    },
    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled) this.cancel();
      return this.enabled;
    },
    isSpeaking() {
      return this.synth && this.synth.speaking;
    }
  };

  // ---------- EMOTIVE DIALOGUE ENGINE (slow, clear Indian English) ----------
  const Dialogue = {
    lines: {
      welcome: [
        { t: "Welcome to A26. Six houses are waiting for your luck. Please place your bets.", e: 'happy', p: 0.98, r: 0.80 },
        { t: "Good evening, player. The cards are warm tonight. Choose your house.", e: 'happy', p: 1.0, r: 0.82 },
        { t: "Hello. I am Priya, your dealer. Shall we begin?", e: 'happy', p: 0.98, r: 0.82 }
      ],
      betPlaced: [
        { t: "Bet placed. You can bet on more houses, or deal when ready.", e: 'happy', p: 0.98, r: 0.82 },
        { t: "Lovely choice. The felt is yours.", e: 'happy', p: 1.0, r: 0.82 },
        { t: "Noted. Your stake is locked in.", e: 'neutral', p: 0.96, r: 0.80 }
      ],
      bettingClosed: [
        { t: "Betting time is over. I am now going to cut the cards.", e: 'serious', p: 0.95, r: 0.78 },
        { t: "Bets are closed. Let me cut the deck now.", e: 'serious', p: 0.96, r: 0.80 }
      ],
      betClosingSoon: [
        { t: "Bets are closing in five seconds. Final wagers only.", e: 'serious', p: 0.95, r: 0.80 }
      ],
      shuffling: [
        { t: "Shuffling the deck. Listen carefully, that is the sound of fortune.", e: 'neutral', p: 0.98, r: 0.78 },
        { t: "Fifty-two cards, perfectly mixed. No favourites here.", e: 'playful', p: 1.0, r: 0.80 }
      ],
      cutDeck: [
        { t: "A player cuts the deck. The cut is sacred.", e: 'serious', p: 0.95, r: 0.78 },
        { t: "And the cut is made. No more peeking now.", e: 'playful', p: 1.0, r: 0.80 }
      ],
      drawing: [
        { t: "Now drawing three cards. Watch closely.", e: 'serious', p: 0.96, r: 0.78 },
        { t: "Here they come. The moment of truth.", e: 'happy', p: 1.0, r: 0.80 }
      ],
      win1: [
        { t: "One match. One to one. Well played.", e: 'happy', p: 1.04, r: 0.82 },
        { t: "A single match pays you back double. Congratulations.", e: 'happy', p: 1.04, r: 0.82 }
      ],
      win2: [
        { t: "Two matches. One to two. A handsome payout.", e: 'excited', p: 1.06, r: 0.84 },
        { t: "Double match, double the joy. Beautiful play.", e: 'excited', p: 1.06, r: 0.84 }
      ],
      win3: [
        { t: "Three matches. One to four. You have hit the jackpot.", e: 'ecstatic', p: 1.10, r: 0.85 },
        { t: "A perfect triple. The deck has crowned you tonight.", e: 'ecstatic', p: 1.08, r: 0.84 }
      ],
      lose: [
        { t: "No matches this round. The cards were shy. Try again?", e: 'sad', p: 0.92, r: 0.80 },
        { t: "Better luck next round. The deck owes you one.", e: 'sad', p: 0.93, r: 0.80 }
      ],
      idle: [
        { t: "Take your time. The cards will wait.", e: 'neutral', p: 0.98, r: 0.80 },
        { t: "Six houses. Six chances. Where will you place your trust?", e: 'playful', p: 1.0, r: 0.80 },
        { t: "I am here when you are ready.", e: 'happy', p: 0.98, r: 0.82 }
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
    sayAndWait(key) {
      const line = this.pick(key);
      Human.setEmotion(line.e);
      Human.setBubble(line.t);
      return Voice.speakAndWait(line.t, { pitch: line.p, rate: line.r });
    },
    sayCustom(text, emotion = 'neutral', pitch = 0.98, rate = 0.82) {
      Human.setEmotion(emotion);
      Human.setBubble(text);
      Voice.speak(text, { pitch, rate });
    }
  };

  // ---------- THE DIGITAL HUMAN ----------
  const Human = {
    root: null,
    faceImg: null,
    currentEmotion: 'neutral',
    lipSyncTimer: null,
    breatheTimer: null,
    nodTimer: null,
    initialized: false,
    parts: {},
    mouthOpenLevel: 0,   // 0..1 — drives mouth overlay scale

    init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      this.root = container;
      container.innerHTML = `
        <div class="dh-stage">
          <div class="dh-vignette"></div>
          <div class="dh-spotlight"></div>

          <div class="dh-image-wrap" id="dhImageWrap">
            <!-- SINGLE FACE IMAGE (never changes, never tilts) -->
            <img class="dh-face-img" id="dhFaceImg" src="${FACE_IMAGE}" alt="Priya, your dealer">

            <!-- SOFT MOUTH OVERLAY (radial gradient — blends with photo) -->
            <div class="dh-mouth-soft" id="dhMouthSoft">
              <div class="dh-mouth-soft-inner" id="dhMouthInner"></div>
              <div class="dh-teeth-soft" id="dhTeethSoft"></div>
            </div>
          </div>

          <!-- Eyelids (subtle blink overlay aligned with the portrait's eyes) -->
          <div class="dh-eye-lid dh-eye-left" id="dhEyeLeft"></div>
          <div class="dh-eye-lid dh-eye-right" id="dhEyeRight"></div>

          <!-- Speaking pulse ring (subtle ambient feedback) -->
          <div class="dh-pulse-ring" id="dhPulseRing"></div>

          <!-- Emotion indicator -->
          <div class="dh-emotion-indicator" id="dhEmotion">neutral</div>

          <!-- Speech bubble -->
          <div class="dh-bubble" id="dhBubble">
            <span id="dhBubbleText"></span>
          </div>

          <!-- Name plate -->
          <div class="dh-name-plate">
            <span class="dh-name">PRIYA</span>
            <span class="dh-role">Your Dealer</span>
          </div>

          <!-- Voice toggle -->
          <button class="dh-voice-toggle" id="dhVoiceToggle" aria-label="Toggle voice">
            <span class="dh-voice-on">\u{1F50A}</span>
            <span class="dh-voice-off">\u{1F507}</span>
          </button>
        </div>
      `;

      this.faceImg = document.getElementById('dhFaceImg');

      this.parts = {
        mouthSoft:  document.getElementById('dhMouthSoft'),
        mouthInner: document.getElementById('dhMouthInner'),
        teethSoft:  document.getElementById('dhTeethSoft'),
        eyeLeft:    document.getElementById('dhEyeLeft'),
        eyeRight:   document.getElementById('dhEyeRight'),
        imageWrap:  document.getElementById('dhImageWrap'),
        pulseRing:  document.getElementById('dhPulseRing')
      };

      this.initialized = true;
      Voice.init();
      this.startBreathing();
      this.startMicroNod();
      this.startBlinking();
      this.bindVoiceToggle();
    },

    bindVoiceToggle() {
      const btn = document.getElementById('dhVoiceToggle');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const on = Voice.toggle();
        btn.classList.toggle('muted', !on);
      });
    },

    // ---------- POSE (cosmetic label only — no image transform) ----------
    // In v9 we DO NOT tilt or shift the image. The dealer stays centered
    // and looking at the camera at all times — like a real live girl on
    // a webcam feed. Poses only affect the speech bubble / state.
    setPose(pose) {
      // No-op for image transforms; kept for API compatibility.
      // Only the spotlight / pulse ring may change colour with pose.
      const ring = this.parts.pulseRing;
      if (ring) ring.dataset.pose = pose;
    },

    // ---------- EMOTIONS (subtle CSS filter on the SAME face) ----------
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
    },

    // ---------- BREATHING (very subtle vertical scale on image wrap) ----------
    // A real person's chest/shoulders rise and fall gently as they breathe.
    // We mimic this with a 0.6% vertical scale at ~3.5s cycle — barely
    // perceptible individually, but adds up to "she looks alive".
    startBreathing() {
      let phase = 0;
      this.breatheTimer = setInterval(() => {
        if (!this.initialized) return;
        phase += 0.035;
        const scale = 1 + Math.sin(phase) * 0.006;
        const wrap = this.parts.imageWrap;
        if (wrap) wrap.style.setProperty('--breathe', scale);
      }, 80);
    },

    // ---------- MICRO HEAD NOD (occasional, very small) ----------
    // Every few seconds the dealer makes a tiny 1-2px head nod, like a
    // real person listening or about to speak. This is a vertical
    // translate only — NO horizontal movement, NO rotation.
    startMicroNod() {
      const doNod = () => {
        if (!this.initialized) return;
        const wrap = this.parts.imageWrap;
        if (wrap) {
          wrap.style.setProperty('--nod', '2px');
          setTimeout(() => {
            if (wrap) wrap.style.setProperty('--nod', '0px');
          }, 220);
        }
        // Schedule next nod at a random 4-9 second interval
        setTimeout(doNod, 4000 + Math.random() * 5000);
      };
      setTimeout(doNod, 3500);
    },

    // ---------- BLINKING (realistic eyelid motion) ----------
    startBlinking() {
      const blink = () => {
        if (!this.initialized) return;
        const doBlink = () => {
          const L = this.parts.eyeLeft, R = this.parts.eyeRight;
          if (L) L.classList.add('blink');
          if (R) R.classList.add('blink');
          setTimeout(() => {
            if (L) L.classList.remove('blink');
            if (R) R.classList.remove('blink');
          }, 140);
        };
        doBlink();
        // 25% chance of a quick double-blink
        if (Math.random() < 0.25) setTimeout(doBlink, 260);
        // Next blink in 2.8-6.3 seconds (natural human blink rate)
        setTimeout(blink, 2800 + Math.random() * 3500);
      };
      setTimeout(blink, 1500);
    },

    // ---------- LIP-SYNC (soft mouth overlay) ----------
    // We use a soft radial-gradient ellipse positioned over the mouth.
    // On each word boundary we pulse the ellipse's height (the "jaw
    // drop"). Between pulses it slowly relaxes back to closed.
    lipSyncStart(opts) {
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.add('speaking');
      const wrap = this.parts.imageWrap;
      if (wrap) wrap.classList.add('speaking');

      this.mouthOpenLevel = 0.2;
      this._applyMouth();

      // Continuous idle mouth motion while speaking — small wobbles
      // every 120ms so the mouth never looks frozen between words.
      this.lipSyncTimer = setInterval(() => {
        if (!this.initialized) return;
        // Slight natural decay
        this.mouthOpenLevel = Math.max(0.1, this.mouthOpenLevel * 0.85);
        // Small random flutter
        this.mouthOpenLevel += (Math.random() - 0.4) * 0.08;
        this.mouthOpenLevel = Math.max(0.05, Math.min(1.0, this.mouthOpenLevel));
        this._applyMouth();
      }, 120);
    },

    // Called on each word boundary — opens the mouth a bit
    pulseMouth() {
      // Randomise the openness a little per word so it doesn't look mechanical
      this.mouthOpenLevel = Math.min(1.0, 0.55 + Math.random() * 0.4);
      this._applyMouth();
    },

    _applyMouth() {
      const soft = this.parts.mouthSoft;
      const inner = this.parts.mouthInner;
      const teeth = this.parts.teethSoft;
      if (!soft || !inner) return;
      const lvl = this.mouthOpenLevel;
      // Map 0..1 to a CSS scale on the inner ellipse
      const scaleY = 0.15 + lvl * 1.4;   // 0.15 .. 1.55
      const opacity = 0.35 + lvl * 0.6;   // 0.35 .. 0.95
      soft.style.setProperty('--mouth-scale', scaleY);
      soft.style.setProperty('--mouth-opacity', opacity);
      if (teeth) {
        teeth.style.opacity = lvl > 0.45 ? Math.min(0.9, (lvl - 0.45) * 2.0) : '0';
      }
    },

    lipSyncStop() {
      if (this.lipSyncTimer) { clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.remove('speaking');
      const wrap = this.parts.imageWrap;
      if (wrap) wrap.classList.remove('speaking');
      this.mouthOpenLevel = 0;
      this._applyMouth();
    },

    // Fallback lip-sync when voice is disabled
    lipSync(text, opts = {}) {
      const duration = Math.max(1200, text.length * 70);
      this.lipSyncStart(opts);
      const t = setInterval(() => {
        this.pulseMouth();
      }, 200);
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
    sayAndWait(key) { return Dialogue.sayAndWait(key); },
    sayCustom(text, emotion, pitch, rate) { return Dialogue.sayCustom(text, emotion, pitch, rate); },

    gesture(type) { /* no-op for API compat */ },

    destroy() {
      if (this.breatheTimer) clearInterval(this.breatheTimer);
      if (this.nodTimer) clearInterval(this.nodTimer);
      if (this.lipSyncTimer) clearInterval(this.lipSyncTimer);
      Voice.cancel();
      this.initialized = false;
    }
  };

  // ---------- EXPORT ----------
  global.DigitalHuman = {
    init: (id) => Human.init(id),
    say: (key) => Human.say(key),
    sayAndWait: (key) => Human.sayAndWait(key),
    sayCustom: (t, e, p, r) => Human.sayCustom(t, e, p, r),
    setPose: (p) => Human.setPose(p),
    setEmotion: (e) => Human.setEmotion(e),
    setBubble: (t) => Human.setBubble(t),
    gesture: (g) => Human.gesture(g),
    voiceOn: () => Voice.enabled,
    toggleVoice: () => Voice.toggle(),
    isSpeaking: () => Voice.isSpeaking(),
    cancelSpeech: () => Voice.cancel()
  };

})(window);
