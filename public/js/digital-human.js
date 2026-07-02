/* ============================================================
   A26 — AI DIGITAL HUMAN DEALER (Real Talking Edition v7)
   ------------------------------------------------------------
   Major upgrade over v6: replaces AI-generated mouth variant
   images (which caused whole-face jitter) with a precise SVG
   mouth overlay that sits ON TOP of a single static face. The
   SVG morphs smoothly between 7 viseme shapes synced to word
   boundaries — giving accurate, smooth lip movement without
   any face vibration.

   Voice is slowed to Indian-English conversational pace
   (rate 0.85, pitch 0.98) with en-IN voice preference.

   Features:
   - 6 photorealistic POSE images (idle/shuffling/cutting/dealing/
     reveal-win/reveal-lose) — crossfade between game phases.
   - SVG MOUTH OVERLAY with 7 viseme shapes (closed/rest/small/
     medium/wide/O/smile) — smooth 180ms morph transitions,
     synced to onboundary word events from Web Speech API.
   - Jaw-drop micro-transform for natural syllable rhythm.
   - 4 photorealistic EMOTION face variants (happy/surprised/
     thinking/sad) — crossfade over active pose on emotion change.
   - Subtle CSS animations: breathing scale, micro-sway,
     eyelid blinks, eye-glint flashes.
   - Web Speech API voice: en-IN female, slowed to 0.85 rate
     for clear Indian-English delivery.
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

  // ---------- EMOTION FACE VARIANTS (crossfade for expression) ----------
  const EMOTION_FACES = {
    happy:     '/images/dealers/real_emotion_happy.png',
    surprised: '/images/dealers/real_emotion_surprised.png',
    thinking:  '/images/dealers/real_emotion_thinking.png',
    sad:       '/images/dealers/real_emotion_sad.png'
  };

  // ---------- VISEME SHAPES (SVG path definitions for the mouth) ----------
  // Each viseme is an SVG <path> drawn in a 100x40 viewBox.
  // The mouth overlay morphs between these smoothly using CSS
  // transitions on the <path d=""> attribute (via JS interpolation
  // would be complex; instead we swap paths with a 180ms opacity
  // crossfade between two stacked SVG layers).
  //
  // Viseme guide (based on Preston-Blair phoneme set, simplified):
  //   rest    — lips together, relaxed (default, between words)
  //   closed  — pressed closed (M, B, P sounds)
  //   small   — slightly open (E, I, slight A)
  //   medium  — open moderate (most vowels)
  //   wide    — wide smile (E, S, Z)
  //   O       — rounded oval (O, U, W)
  //   smile   — upturned corners (happy emphasis, end of phrase)
  const VISEMES = ['rest', 'closed', 'small', 'medium', 'wide', 'O', 'smile'];

  // SVG path for each viseme — drawn in viewBox "0 0 100 40"
  // These are lip outlines with an inner mouth opening.
  const VISEME_PATHS = {
    rest:    'M20,20 Q50,18 80,20 Q50,22 20,20 Z',
    closed:  'M22,21 Q50,19 78,21 Q50,23 22,21 Z',
    small:   'M25,17 Q50,14 75,17 Q50,26 25,17 Z',
    medium:  'M23,14 Q50,10 77,14 Q50,30 23,14 Z',
    wide:    'M18,18 Q50,12 82,18 Q50,24 18,18 Z',
    O:       'M38,12 Q50,10 62,12 Q66,20 62,28 Q50,30 38,28 Q34,20 38,12 Z',
    smile:   'M18,16 Q50,12 82,16 Q50,28 18,16 Z'
  };

  // Inner mouth (dark cavity) path — only visible when mouth is open
  const VISEME_INNER = {
    rest:    'M20,20 Q50,20 80,20 Z',
    closed:  'M22,21 Q50,21 78,21 Z',
    small:   'M28,18 Q50,16 72,18 Q50,23 28,18 Z',
    medium:  'M26,15 Q50,12 74,15 Q50,27 26,15 Z',
    wide:    'M22,18 Q50,14 78,18 Q50,22 22,18 Z',
    O:       'M40,14 Q50,13 60,14 Q63,20 60,26 Q50,27 40,26 Q37,20 40,14 Z',
    smile:   'M22,17 Q50,14 78,17 Q50,25 22,17 Z'
  };

  // ---------- VOICE MANAGER (Indian English, slowed) ----------
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
        // Strong preference order for Indian English female voices
        const prefs = [
          v => v.lang === 'en-IN' && /female|priya|isha|kalpana|raveena|heera|veena|isha/i.test(v.name),
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
    speak(text, opts = {}) {
      if (!this.synth || !this.enabled) {
        Human.lipSync(text, opts);
        return;
      }
      this.synth.cancel();
      // Split text into sentence chunks and speak with pauses for
      // a more natural, slower Indian-English delivery.
      const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
      let charOffset = 0;
      sentences.forEach((sentence, idx) => {
        const u = new SpeechSynthesisUtterance(sentence.trim());
        if (this.voice) u.voice = this.voice;
        // Slow, clear Indian-English pace: rate 0.85 (down from 1.0)
        // Slightly lower pitch for warm, mature female tone
        u.rate   = opts.rate   != null ? opts.rate   : 0.85;
        u.pitch  = opts.pitch  != null ? opts.pitch  : 0.98;
        u.volume = opts.volume != null ? opts.volume : 1.0;

        const myCharOffset = charOffset;
        if (idx === 0) {
          u.onstart = () => { Human.lipSyncStart(opts); };
        }
        u.onend = () => {
          if (idx === sentences.length - 1) Human.lipSyncStop();
        };
        u.onerror = () => { if (idx === sentences.length - 1) Human.lipSyncStop(); };
        u.onboundary = (ev) => {
          if (ev.name === 'word' || ev.name === undefined) {
            Human.nextViseme(myCharOffset + (ev.charIndex || 0), sentence);
          }
        };
        charOffset += sentence.length;
        // Small gap between sentences for natural pacing
        setTimeout(() => this.synth.speak(u), idx * 80);
      });
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

  // ---------- EMOTIVE DIALOGUE ENGINE (slowed for Indian English) ----------
  const Dialogue = {
    lines: {
      welcome: [
        { t: "Welcome to A26. Six houses are waiting for your luck. Please place your bets.", e: 'happy', p: 0.98, r: 0.82 },
        { t: "Good evening, player. The cards are warm tonight. Choose your house.", e: 'happy', p: 1.0, r: 0.84 },
        { t: "Hello. I am Priya, your digital dealer. Shall we begin?", e: 'happy', p: 0.98, r: 0.85 },
        { t: "Six houses, three cards, and one chance to win big. Are you ready?", e: 'playful', p: 1.0, r: 0.84 }
      ],
      betPlaced: [
        { t: "Bet placed. You can bet on more houses, or deal when ready.", e: 'happy', p: 0.98, r: 0.85 },
        { t: "Lovely choice. The felt is yours.", e: 'happy', p: 1.0, r: 0.85 },
        { t: "Good. I can feel your confidence from here.", e: 'playful', p: 1.0, r: 0.85 },
        { t: "Noted. Your stake is locked in.", e: 'neutral', p: 0.96, r: 0.84 }
      ],
      betClosed: [
        { t: "Bets are closing in three seconds. Final wagers only.", e: 'serious', p: 0.95, r: 0.82 },
        { t: "Last call, player. The deck is hungry.", e: 'playful', p: 0.98, r: 0.84 }
      ],
      shuffling: [
        { t: "Shuffling the deck. Listen carefully, that is the sound of fortune.", e: 'neutral', p: 0.98, r: 0.82 },
        { t: "Fifty-two cards, perfectly mixed. No favourites here.", e: 'playful', p: 1.0, r: 0.84 },
        { t: "The shuffle begins. Lady luck has her eyes on someone tonight.", e: 'happy', p: 1.0, r: 0.83 }
      ],
      cutDeck: [
        { t: "A player cuts the deck. The cut is sacred.", e: 'serious', p: 0.95, r: 0.82 },
        { t: "Cut the cards. May the cut favour the bold.", e: 'happy', p: 0.98, r: 0.84 },
        { t: "And the cut is made. No more peeking now.", e: 'playful', p: 1.0, r: 0.84 }
      ],
      drawing: [
        { t: "Drawing three cards. Watch closely.", e: 'serious', p: 0.96, r: 0.82 },
        { t: "One, two, three. Let us see what fate has dealt.", e: 'happy', p: 1.0, r: 0.82 },
        { t: "Here they come. The moment of truth.", e: 'happy', p: 1.0, r: 0.84 }
      ],
      card1: [
        { t: "First card revealed.", e: 'neutral', p: 0.98, r: 0.84 },
        { t: "And the first card is out.", e: 'neutral', p: 0.98, r: 0.84 },
        { t: "Card one. Two more to go.", e: 'neutral', p: 1.0, r: 0.84 }
      ],
      card2: [
        { t: "Second card on the table.", e: 'neutral', p: 0.98, r: 0.84 },
        { t: "There goes the second.", e: 'neutral', p: 0.98, r: 0.84 },
        { t: "Halfway through. One more card.", e: 'playful', p: 1.0, r: 0.84 }
      ],
      card3: [
        { t: "And the final card.", e: 'serious', p: 0.95, r: 0.82 },
        { t: "The last card. Hold your breath.", e: 'serious', p: 0.96, r: 0.82 },
        { t: "Three cards, three destinies.", e: 'happy', p: 1.0, r: 0.83 }
      ],
      win1: [
        { t: "One match. You win at one to one. Well played.", e: 'happy', p: 1.05, r: 0.85 },
        { t: "A single match pays you back double. Congratulations.", e: 'happy', p: 1.04, r: 0.85 },
        { t: "One match, one reward. The deck was kind tonight.", e: 'happy', p: 1.02, r: 0.85 }
      ],
      win2: [
        { t: "Two matches. One to two, that is a handsome payout.", e: 'excited', p: 1.08, r: 0.86 },
        { t: "Two matches. Lady luck is smiling at you.", e: 'excited', p: 1.06, r: 0.86 },
        { t: "Double match, double the joy. Beautiful play.", e: 'excited', p: 1.06, r: 0.85 }
      ],
      win3: [
        { t: "Three matches. One to four. You have hit the jackpot.", e: 'ecstatic', p: 1.12, r: 0.88 },
        { t: "Three of a kind. Incredible. One to four is yours.", e: 'ecstatic', p: 1.1, r: 0.87 },
        { t: "A perfect triple. The deck has crowned you tonight.", e: 'ecstatic', p: 1.08, r: 0.86 }
      ],
      lose: [
        { t: "No matches this round. The cards were shy. Try again?", e: 'sad', p: 0.92, r: 0.82 },
        { t: "Better luck next round. The deck owes you one.", e: 'sad', p: 0.93, r: 0.83 },
        { t: "Not your round. Stay sharp, the next shuffle is fresh.", e: 'neutral', p: 0.95, r: 0.83 }
      ],
      idle: [
        { t: "Take your time. The cards will wait.", e: 'neutral', p: 0.98, r: 0.83 },
        { t: "Six houses. Six chances. Where will you place your trust?", e: 'playful', p: 1.0, r: 0.84 },
        { t: "I am here when you are ready.", e: 'happy', p: 0.98, r: 0.84 }
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
    sayCustom(text, emotion = 'neutral', pitch = 0.98, rate = 0.85) {
      Human.setEmotion(emotion);
      Human.setBubble(text);
      Voice.speak(text, { pitch, rate });
    }
  };

  // ---------- THE DIGITAL HUMAN ----------
  const Human = {
    root: null,
    layers: {},          // pose image layers
    emotionLayers: {},   // emotion face image layers (crossfade overlay)
    currentPose: 'idle',
    currentEmotion: 'neutral',
    lipSyncTimer: null,
    visemeIndex: 0,
    currentViseme: 'rest',
    breatheTimer: null,
    swayTimer: null,
    initialized: false,
    framesLoaded: { emotion: false },
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
            <!-- Layer 1: Pose images (crossfaded) -->
            ${Object.entries(POSES).map(([key, src]) =>
              `<img class="dh-img ${key === 'idle' ? 'active' : ''}" data-pose="${key}" src="${src}" alt="">`
            ).join('')}

            <!-- Layer 2: Emotion face variants (crossfade overlay) -->
            ${Object.entries(EMOTION_FACES).map(([key, src]) =>
              `<img class="dh-emotion-img" data-emotion="${key}" src="${src}" alt="">`
            ).join('')}

            <!-- Layer 3: SVG MOUTH OVERLAY (precise viseme morphing) -->
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
                <!-- Inner mouth (dark cavity, visible when open) -->
                <path class="dh-mouth-inner" id="dhMouthInnerPath"
                      d="${VISEME_INNER.rest}" fill="#3a1018"/>
                <!-- Teeth (visible when open enough) -->
                <path class="dh-mouth-teeth" id="dhMouthTeethPath"
                      d="${VISEME_INNER.rest}" fill="url(#teethGrad)" opacity="0"/>
                <!-- Outer lips -->
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

      // Cache pose layers
      this.layers = {};
      this.root.querySelectorAll('.dh-img').forEach(img => {
        this.layers[img.dataset.pose] = img;
      });

      // Cache emotion face layers
      this.emotionLayers = {};
      this.root.querySelectorAll('.dh-emotion-img').forEach(img => {
        this.emotionLayers[img.dataset.emotion] = img;
        img.addEventListener('load',  () => { this.framesLoaded.emotion = true; });
        img.addEventListener('error', () => { img.dataset.failed = '1'; });
      });

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

    // ---------- LIP-SYNC (SVG mouth morphing — accurate, smooth) ----------
    // Two layers of motion:
    //   1. Word-synced viseme changes (driven by Voice.speak onboundary)
    //      — each word boundary triggers a viseme based on the word's first
    //        letter, producing natural lip motion that matches speech rhythm.
    //   2. Continuous fallback timer (160ms) cycles through a natural
    //      viseme pattern when boundary events don't fire (some browsers
    //      don't emit them). This guarantees the mouth always moves during speech.
    lipSyncStart(opts) {
      const ring = this.parts.pulseRing;
      if (ring) ring.classList.add('speaking');
      const wrap = this.parts.imageWrap;
      if (wrap) wrap.classList.add('speaking');
      this.visemeIndex = 0;
      this.currentViseme = 'rest';

      // Start the continuous fallback viseme cycle (slower, more natural)
      this.lipSyncTimer = setInterval(() => {
        if (!this.initialized) return;
        this._cycleViseme();
      }, 160);

      // Open the mouth slightly at speech start
      this._setViseme('small');
    },

    // Called per word boundary (from Voice.speak) — picks a viseme based
    // on the word's first letter to make the mouth motion look natural.
    nextViseme(charIndex, sentence) {
      // Map first letter of the current word to a viseme.
      // This produces phoneme-like variation that looks like real talking.
      const text = (sentence || '').toLowerCase();
      const i = charIndex || 0;
      let ch = text[i];
      // Skip non-letters
      let k = i;
      while (k < text.length && !/[a-z]/.test(text[k])) k++;
      ch = text[k] || 'a';

      // Phoneme-to-viseme mapping (simplified Preston-Blair)
      let viseme;
      if ('mpb'.includes(ch))         viseme = 'closed';
      else if ('oquvw'.includes(ch))  viseme = 'O';
      else if ('aei'.includes(ch))    viseme = 'medium';
      else if ('szrnltcdgkh'.includes(ch)) viseme = 'wide';
      else if ('y'.includes(ch))      viseme = 'small';
      else if ('f'.includes(ch))      viseme = 'small';
      else                              viseme = 'medium';

      this._setViseme(viseme);
      // Track for the fallback cycle so it doesn't fight the word boundary
      this.visemeIndex++;
    },

    // Internal: cycle to next viseme (fallback timer)
    _cycleViseme() {
      // Natural talking pattern: rest → small → medium → small → O → small → rest → wide → ...
      // Returns to rest between syllables for realistic rhythm.
      const cycle = ['rest', 'small', 'medium', 'small', 'O', 'small', 'rest', 'wide', 'small', 'medium', 'rest', 'small'];
      const v = cycle[this.visemeIndex % cycle.length];
      this._setViseme(v);
      this.visemeIndex++;
    },

    // Internal: apply a viseme by morphing the SVG mouth path
    _setViseme(visemeKey) {
      if (!VISEME_PATHS[visemeKey]) visemeKey = 'rest';
      if (this.currentViseme === visemeKey) return;
      this.currentViseme = visemeKey;

      const outer = this.parts.mouthOuter;
      const inner = this.parts.mouthInner;
      const teeth = this.parts.mouthTeeth;
      if (!outer || !inner) return;

      // Morph the SVG paths (CSS transition on the path handles smoothness)
      outer.setAttribute('d', VISEME_PATHS[visemeKey]);
      inner.setAttribute('d', VISEME_INNER[visemeKey]);

      // Show teeth when mouth is open enough
      const openVisemes = ['medium', 'wide', 'O', 'smile'];
      if (teeth) {
        teeth.setAttribute('d', VISEME_INNER[visemeKey]);
        teeth.style.opacity = openVisemes.includes(visemeKey) ? '0.85' : '0';
      }

      // Jaw-drop micro-transform on the overlay for 3D feel
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
      // Return mouth to rest position
      this._setViseme('rest');
    },

    lipSync(text, opts = {}) {
      // Fallback when voice disabled — simulate duration from text length.
      // Slower duration to match the new Indian-English pace.
      const duration = Math.max(1200, text.length * 75);
      this.lipSyncStart(opts);
      let frame = 0;
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
