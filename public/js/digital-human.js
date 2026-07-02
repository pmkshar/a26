/* ============================================================
   A26 — AI DIGITAL HUMAN DEALER (Single-Face Edition v8)
   ------------------------------------------------------------
   Major rework over v7 to fix user-reported issues:
   1. FACE FLUCTUATION FIXED — Uses ONE single dealer portrait
      image as the permanent face. No more crossfading between
      6 different AI pose images (which looked like 6 different
      people). Pose changes are now CSS transforms on the same
      image (tilt/scale/shift) so the face NEVER changes.
   2. VOICE OVERLAP FIXED — Single utterance per speech call.
      Sequential narration uses speakAndWait() which resolves
      on the utterance's onend event — no more overlapping audio.
   3. LIP-SYNC SYNCED — Lip-sync starts on utterance.onstart
      and stops on utterance.onend. No more orphan viseme timers.
   4. NEW: "Betting time is over" announcement when the betting
      window closes, before the dealer cuts the cards.

   Architecture:
   - ONE base portrait image (real_idle.png) always visible.
   - SVG mouth overlay (7 viseme shapes) for accurate lip-sync.
   - CSS filter classes for emotions (brightness/saturation/hue).
   - CSS transform classes for poses (tilt/scale/translate).
   - Web Speech API: en-IN female, rate 0.85, one utterance at a time.
   ============================================================ */

(function (global) {
  'use strict';

  // ---------- SINGLE FACE IMAGE ----------
  // Only one portrait is ever shown. Pose/emotion are CSS-driven.
  const FACE_IMAGE = '/images/dealers/real_idle.png';

  // ---------- VISEME SHAPES (SVG path definitions for the mouth) ----------
  const VISEMES = ['rest', 'closed', 'small', 'medium', 'wide', 'O', 'smile'];

  const VISEME_PATHS = {
    rest:    'M20,20 Q50,18 80,20 Q50,22 20,20 Z',
    closed:  'M22,21 Q50,19 78,21 Q50,23 22,21 Z',
    small:   'M25,17 Q50,14 75,17 Q50,26 25,17 Z',
    medium:  'M23,14 Q50,10 77,14 Q50,30 23,14 Z',
    wide:    'M18,18 Q50,12 82,18 Q50,24 18,18 Z',
    O:       'M38,12 Q50,10 62,12 Q66,20 62,28 Q50,30 38,28 Q34,20 38,12 Z',
    smile:   'M18,16 Q50,12 82,16 Q50,28 18,16 Z'
  };

  const VISEME_INNER = {
    rest:    'M20,20 Q50,20 80,20 Z',
    closed:  'M22,21 Q50,21 78,21 Z',
    small:   'M28,18 Q50,16 72,18 Q50,23 28,18 Z',
    medium:  'M26,15 Q50,12 74,15 Q50,27 26,15 Z',
    wide:    'M22,18 Q50,14 78,18 Q50,22 22,18 Z',
    O:       'M40,14 Q50,13 60,14 Q63,20 60,26 Q50,27 40,26 Q37,20 40,14 Z',
    smile:   'M22,17 Q50,14 78,17 Q50,25 22,17 Z'
  };

  // ---------- VOICE MANAGER (single utterance, no overlap) ----------
  const Voice = {
    synth: null,
    voice: null,
    enabled: true,
    currentUtterance: null,   // The active SpeechSynthesisUtterance
    onEndCallback: null,      // Resolves when current utterance ends
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
    // Speak a single text as ONE utterance. Cancels any current speech.
    // Returns a Promise that resolves when the utterance ends.
    speak(text, opts = {}) {
      // Resolve any pending onEndCallback (previous speech getting cut off)
      if (this.onEndCallback) {
        const cb = this.onEndCallback;
        this.onEndCallback = null;
        cb();
      }

      if (!this.synth || !this.enabled) {
        // Voice disabled — run lip-sync fallback for estimated duration
        Human.lipSync(text, opts);
        const duration = Math.max(1200, text.length * 75);
        return new Promise(resolve => setTimeout(() => { Human.lipSyncStop(); resolve(); }, duration));
      }

      // Cancel any current speech synth
      this.synth.cancel();

      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate   = opts.rate   != null ? opts.rate   : 0.85;
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
          Human.nextViseme(ev.charIndex || 0, text);
        }
      };

      // Set up the end promise BEFORE calling speak
      const endPromise = new Promise(resolve => {
        this.onEndCallback = resolve;
      });

      // Small delay to let cancel() take effect before speaking
      setTimeout(() => {
        if (this.synth) this.synth.speak(u);
      }, 50);

      return endPromise;
    },
    // Speak and wait for completion (for sequential narration)
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
    // Check if currently speaking
    isSpeaking() {
      return this.synth && this.synth.speaking;
    }
  };

  // ---------- EMOTIVE DIALOGUE ENGINE (slowed for Indian English) ----------
  const Dialogue = {
    lines: {
      welcome: [
        { t: "Welcome to A26. Six houses are waiting for your luck. Please place your bets.", e: 'happy', p: 0.98, r: 0.82 },
        { t: "Good evening, player. The cards are warm tonight. Choose your house.", e: 'happy', p: 1.0, r: 0.84 },
        { t: "Hello. I am Priya, your digital dealer. Shall we begin?", e: 'happy', p: 0.98, r: 0.85 }
      ],
      betPlaced: [
        { t: "Bet placed. You can bet on more houses, or deal when ready.", e: 'happy', p: 0.98, r: 0.85 },
        { t: "Lovely choice. The felt is yours.", e: 'happy', p: 1.0, r: 0.85 },
        { t: "Noted. Your stake is locked in.", e: 'neutral', p: 0.96, r: 0.84 }
      ],
      bettingClosed: [
        { t: "Betting time is over. I am now going to cut the cards.", e: 'serious', p: 0.95, r: 0.80 },
        { t: "Bets are closed. Let me cut the deck now.", e: 'serious', p: 0.96, r: 0.82 }
      ],
      betClosingSoon: [
        { t: "Bets are closing in five seconds. Final wagers only.", e: 'serious', p: 0.95, r: 0.82 }
      ],
      shuffling: [
        { t: "Shuffling the deck. Listen carefully, that is the sound of fortune.", e: 'neutral', p: 0.98, r: 0.80 },
        { t: "Fifty-two cards, perfectly mixed. No favourites here.", e: 'playful', p: 1.0, r: 0.82 }
      ],
      cutDeck: [
        { t: "A player cuts the deck. The cut is sacred.", e: 'serious', p: 0.95, r: 0.80 },
        { t: "And the cut is made. No more peeking now.", e: 'playful', p: 1.0, r: 0.82 }
      ],
      drawing: [
        { t: "Now drawing three cards. Watch closely.", e: 'serious', p: 0.96, r: 0.80 },
        { t: "Here they come. The moment of truth.", e: 'happy', p: 1.0, r: 0.82 }
      ],
      card1: [
        { t: "First card revealed.", e: 'neutral', p: 0.98, r: 0.82 },
        { t: "And the first card is out.", e: 'neutral', p: 0.98, r: 0.82 }
      ],
      card2: [
        { t: "Second card on the table.", e: 'neutral', p: 0.98, r: 0.82 },
        { t: "Halfway through. One more card.", e: 'playful', p: 1.0, r: 0.82 }
      ],
      card3: [
        { t: "And the final card.", e: 'serious', p: 0.95, r: 0.80 },
        { t: "The last card. Hold your breath.", e: 'serious', p: 0.96, r: 0.80 }
      ],
      win1: [
        { t: "One match. You win at one to one. Well played.", e: 'happy', p: 1.05, r: 0.85 },
        { t: "A single match pays you back double. Congratulations.", e: 'happy', p: 1.04, r: 0.85 }
      ],
      win2: [
        { t: "Two matches. One to two, that is a handsome payout.", e: 'excited', p: 1.08, r: 0.86 },
        { t: "Double match, double the joy. Beautiful play.", e: 'excited', p: 1.06, r: 0.85 }
      ],
      win3: [
        { t: "Three matches. One to four. You have hit the jackpot.", e: 'ecstatic', p: 1.12, r: 0.88 },
        { t: "A perfect triple. The deck has crowned you tonight.", e: 'ecstatic', p: 1.08, r: 0.86 }
      ],
      lose: [
        { t: "No matches this round. The cards were shy. Try again?", e: 'sad', p: 0.92, r: 0.82 },
        { t: "Better luck next round. The deck owes you one.", e: 'sad', p: 0.93, r: 0.83 }
      ],
      idle: [
        { t: "Take your time. The cards will wait.", e: 'neutral', p: 0.98, r: 0.83 },
        { t: "Six houses. Six chances. Where will you place your trust?", e: 'playful', p: 1.0, r: 0.82 },
        { t: "I am here when you are ready.", e: 'happy', p: 0.98, r: 0.84 }
      ]
    },
    pick(key) {
      const arr = this.lines[key] || this.lines.idle;
      return arr[Math.floor(Math.random() * arr.length)];
    },
    // Fire-and-forget speak (cancels current speech)
    say(key) {
      const line = this.pick(key);
      Human.setEmotion(line.e);
      Human.setBubble(line.t);
      Voice.speak(line.t, { pitch: line.p, rate: line.r });
      return line;
    },
    // Speak and wait for completion (returns Promise)
    sayAndWait(key) {
      const line = this.pick(key);
      Human.setEmotion(line.e);
      Human.setBubble(line.t);
      return Voice.speakAndWait(line.t, { pitch: line.p, rate: line.r });
    },
    sayCustom(text, emotion = 'neutral', pitch = 0.98, rate = 0.85) {
      Human.setEmotion(emotion);
      Human.setBubble(text);
      Voice.speak(text, { pitch, rate });
    }
  };

  // ---------- THE DIGITAL HUMAN ----------
  const Human = {
    root: null,
    faceImg: null,       // The ONE single face image
    currentPose: 'idle',
    currentEmotion: 'neutral',
    lipSyncTimer: null,
    visemeIndex: 0,
    currentViseme: 'rest',
    breatheTimer: null,
    swayTimer: null,
    initialized: false,
    parts: {},

    init(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;
      this.root = container;
      container.innerHTML = `
        <div class="dh-stage">
          <div class="dh-vignette"></div>
          <div class="dh-spotlight"></div>

          <div class="dh-image-wrap" id="dhImageWrap">
            <!-- SINGLE FACE IMAGE (never changes) -->
            <img class="dh-face-img active" id="dhFaceImg" src="${FACE_IMAGE}" alt="Priya, your dealer">

            <!-- SVG MOUTH OVERLAY (precise viseme morphing) -->
            <div class="dh-mouth-overlay" id="dhMouthOverlay">
              <svg class="dh-mouth-svg" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="lipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#c8546a"/>
                    <stop offset="50%" stop-color="#a83a52"/>
                    <stop offset="100%" stop-color="#7a2540"/>
                  </linearGradient>
                  <linearGradient id="teethGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stop-color="#fff8f0"/>
                    <stop offset="100%" stop-color="#e8d8c8"/>
                  </linearGradient>
                </defs>
                <path class="dh-mouth-inner" id="dhMouthInnerPath"
                      d="${VISEME_INNER.rest}" fill="#3a1018"/>
                <path class="dh-mouth-teeth" id="dhMouthTeethPath"
                      d="${VISEME_INNER.rest}" fill="url(#teethGrad)" opacity="0"/>
                <path class="dh-mouth-outer" id="dhMouthOuterPath"
                      d="${VISEME_PATHS.rest}" fill="url(#lipGrad)" stroke="#5a1830" stroke-width="0.5"/>
              </svg>
            </div>
          </div>

          <!-- Eye blink overlays (subtle) -->
          <div class="dh-eye dh-eye-left" id="dhEyeLeft"></div>
          <div class="dh-eye dh-eye-right" id="dhEyeRight"></div>
          <div class="dh-glint dh-glint-left" id="dhGlintLeft"></div>
          <div class="dh-glint dh-glint-right" id="dhGlintRight"></div>

          <!-- Speaking pulse ring -->
          <div class="dh-pulse-ring" id="dhPulseRing"></div>

          <!-- Emotion indicator (debug) -->
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
            <span class="dh-voice-on">🔊</span>
            <span class="dh-voice-off">🔇</span>
          </button>
        </div>
      `;

      // Cache the single face image
      this.faceImg = document.getElementById('dhFaceImg');

      // Cache face overlays
      this.parts = {
        mouthOverlay: document.getElementById('dhMouthOverlay'),
        mouthOuter: document.getElementById('dhMouthOuterPath'),
        mouthInner: document.getElementById('dhMouthInnerPath'),
        mouthTeeth: document.getElementById('dhMouthTeethPath'),
        eyeLeft: document.getElementById('dhEyeLeft'),
        eyeRight: document.getElementById('dhEyeRight'),
        glintLeft: document.getElementById('dhGlintLeft'),
        glintRight: document.getElementById('dhGlintRight'),
        imageWrap: document.getElementById('dhImageWrap'),
        pulseRing: document.getElementById('dhPulseRing')
      };

      this.initialized = true;
      Voice.init();
      this.startBreathing();
      this.startSway();
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

    // ---------- POSE (CSS transform on the SAME face — no image swap) ----------
    // The face image never changes. Poses are applied as CSS classes
    // that tilt/scale/shift the image to simulate dealer actions.
    setPose(pose) {
      this.currentPose = pose;
      if (!this.initialized) return;
      const wrap = this.parts.imageWrap;
      if (!wrap) return;
      // Remove all pose classes
      ['idle', 'shuffling', 'cutting', 'dealing', 'reveal-win', 'reveal-lose'].forEach(p =>
        wrap.classList.remove('pose-' + p));
      // Add the new pose class
      wrap.classList.add('pose-' + (pose || 'idle'));
    },

    // ---------- EMOTIONS (CSS filter on the SAME face — no image swap) ----------
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

    // ---------- LIP-SYNC (SVG mouth morphing — accurate, smooth) ----------
    lipSyncStart(opts) {
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.add('speaking');
      const wrap = this.parts.imageWrap;
      if (wrap) wrap.classList.add('speaking');
      this.visemeIndex = 0;
      this.currentViseme = 'rest';

      // Start the continuous fallback viseme cycle
      this.lipSyncTimer = setInterval(() => {
        if (!this.initialized) return;
        this._cycleViseme();
      }, 160);

      // Open the mouth slightly at speech start
      this._setViseme('small');
    },

    nextViseme(charIndex, text) {
      const lower = (text || '').toLowerCase();
      const i = charIndex || 0;
      let k = i;
      while (k < lower.length && !/[a-z]/.test(lower[k])) k++;
      const ch = lower[k] || 'a';

      let viseme;
      if ('mpb'.includes(ch))         viseme = 'closed';
      else if ('oquvw'.includes(ch))  viseme = 'O';
      else if ('aei'.includes(ch))    viseme = 'medium';
      else if ('szrnltcdgkh'.includes(ch)) viseme = 'wide';
      else if ('yf'.includes(ch))     viseme = 'small';
      else                              viseme = 'medium';

      this._setViseme(viseme);
      this.visemeIndex++;
    },

    _cycleViseme() {
      const cycle = ['rest', 'small', 'medium', 'small', 'O', 'small', 'rest', 'wide', 'small', 'medium', 'rest', 'small'];
      const v = cycle[this.visemeIndex % cycle.length];
      this._setViseme(v);
      this.visemeIndex++;
    },

    _setViseme(visemeKey) {
      if (!VISEME_PATHS[visemeKey]) visemeKey = 'rest';
      if (this.currentViseme === visemeKey) return;
      this.currentViseme = visemeKey;

      const outer = this.parts.mouthOuter;
      const inner = this.parts.mouthInner;
      const teeth = this.parts.mouthTeeth;
      if (!outer || !inner) return;

      outer.setAttribute('d', VISEME_PATHS[visemeKey]);
      inner.setAttribute('d', VISEME_INNER[visemeKey]);

      const openVisemes = ['medium', 'wide', 'O', 'smile'];
      if (teeth) {
        teeth.setAttribute('d', VISEME_INNER[visemeKey]);
        teeth.style.opacity = openVisemes.includes(visemeKey) ? '0.85' : '0';
      }

      const overlay = this.parts.mouthOverlay;
      if (overlay) {
        const dropMap = { rest: 0, closed: 0, small: 1, medium: 2, wide: 1, O: 3, smile: 0 };
        overlay.style.setProperty('--jaw-drop', (dropMap[visemeKey] || 0) + 'px');
      }
    },

    lipSyncStop() {
      if (this.lipSyncTimer) { clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.remove('speaking');
      const wrap = this.parts.imageWrap;
      if (wrap) wrap.classList.remove('speaking');
      this._setViseme('rest');
    },

    // Fallback lip-sync when voice is disabled
    lipSync(text, opts = {}) {
      const duration = Math.max(1200, text.length * 75);
      this.lipSyncStart(opts);
      const t = setInterval(() => this._cycleViseme(), 180);
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
