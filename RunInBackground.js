class RunInBackground {
  /**
   * Current AudioContext that is running audio. null when not running.
   * @type {(AudioContext | null)}
   */
  ctx = null;
  /**
   * Whether the class is active, i.e. should be playing audio. Defaults to
   * true, because that's what's expected. We persist the value of the setting
   * by *modifying the default value* here, via self-modifying code.
   * @type {boolean}
   */
  active = true;
  /**
   * Reference to the OptionSwitch function component, hooked from the game.
   * @type {(OptionSwitch | null)}
   */
  OptionSwitch = null; /* OptionSwitch | null */
  /**
   * The workerScript object. This is what backs "ns", and having direct
   * access gives us incredible power: The ability to make calls without RAM
   * usage, call internal functions, and much more. We're only using it to
   * make log entries and re-write our code after the script has "died".
   * @type {(WorkerScript | null)}
   */
  workerScript = null;

  /**
   * Plays a constant hum (too slow and low to be heard) to prevent backgrounding the tab.
   * @param {Event} evt
   */
  updateHum(evt) {
    // The exact equality means that no event = run always
    if (evt?.isTrusted === false) return;
    if (this.active === !!this.ctx) return;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    } else {
      this.ctx = new AudioContext({ latencyHint: "playback" });
      const osc = this.ctx.createOscillator();
      // 1Hz - far too low to be audible
      osc.frequency.setValueAtTime(1, this.ctx.currentTime);
      const gain = this.ctx.createGain();
      // This is just above the threshold where playback is considered "silent".
      gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      // Have to avoid picking up the RAM cost of singularity.connect
      osc["connect"](gain);
      gain["connect"](this.ctx.destination);
      osc.start();
    }
  }

  /** @returns React.Element to be added to the options menu */
  createOption() {
    if (!this.OptionSwitch) {
      return React.createElement(
        "div",
        {
          style: {
            color: "red",
            fontSize: "30px",
            fontFamily: "sans-serif",
          },
        },
        `Error initializing ${this.workerScript.name}`
      );
    } else {
      return React.createElement(this.OptionSwitch, {
        checked: this.active,
        onChange: (newValue) => {
          if (this.active !== newValue) {
            this.active = newValue;
            this.writeDefaultValue();
          }
          this.updateHum();
        },
        text: "Run in background (unneeded for Steam version)",
        tooltip: `If this is set, the game will keep running even when it doesn't have focus.
          This uses the audio API, so you may see an audio indicator for the tab but it shouldn't
          make noise. If unset and running in a browser, the game will process slowly when the
          tab isn't focused. The Steam version always runs, even in the background.`,
      });
    }
  }

  writeDefaultValue() {
    this.workerScript.print(`Option toggled to ${this.active}`);
    // Have to avoid picking this up as an NS function
    const server = this.workerScript["getServer"]();
    const script = server.scripts.get(this.workerScript.name);
    if (!script) {
      this.workerScript.print(
        `Couldn't find script for ${this.workerScript.name}!`
      );
      return;
    }
    // Match the line where we set the default value, and capture the value
    // itself, with indices. This is specific enough to not match anything else.
    const pat = /^ *active = ([a-z]*);/dm;
    // Avoid parsing as ns.exec()
    const result = pat["exec"](script.content);
    if (!result) {
      this.workerScript.print(
        `Couldn't match pattern to rewrite the default value in ${this.workerScript.name}!`
      );
      return;
    }
    script.content =
      script.content.slice(0, result.indices[1][0]) +
      String(this.active) +
      script.content.slice(result.indices[1][1]);
  }

  registerHandler() {
    // We need to call updateHum from a user action, because Chrome won't give
    // us a working AudioContext except in that circumstance. Clicking on the
    // settings toggle counts, but we need this listener to kick-start things
    // at game start.
    // The options mean the listener is in the "capturing" phase (before other
    // listeners can cancel event propogation for us), and "passive" because
    // we never preventDefault().
    globalThis["document"].addEventListener(
      "click",
      this.updateHum.bind(this),
      { capture: true, passive: true }
    );
  }

  hookReact() {
    const orig = React.createElement;
    const _this = this;
    React.createElement = function (...args) {
      const fn = args[0];
      const props = args[1];
      if (
        typeof fn !== "function" ||
        props === null ||
        typeof props !== "object" ||
        props.title !== "System" ||
        !String(fn).includes('height:"fit-content"')
      ) {
        return orig.call(this, ...args);
      }
      if (_this.OptionSwitch === null) {
        let i = 2;
        for (; i < args.length; ++i) {
          const child = args[i];
          if (
            child !== null &&
            typeof child === "object" &&
            typeof child.type === "function" &&
            String(child.type).includes(".target.checked")
          ) {
            _this.OptionSwitch = child.type;
            break;
          }
        }
        if (i >= args.length) {
          _this.workerScript.print("Unable to find OptionSwitch!");
        }
      }
      // Add our option to the end of the children
      return orig.call(this, ...args, _this.createOption());
    };
    return orig;
  }

  /** @param {NS} ns */
  hookWorkerScript(ns) {
    const orig = Map.prototype.get;
    const _this = this;
    Map.prototype.get = function (...args) {
      // We can safely assume that the first call to this will be the call we
      // want, because of synchronous execution.
      Map.prototype.get = orig;
      _this.workerScript = orig.call(this, ...args);
      return _this.workerScript;
    };
    // This internally has to get the current script, which gets the worker
    // script from workerscript map as a first step.
    // getSciptLogs() was chosen because it's 0GB and has no effect.
    ns.getScriptLogs();
    // Just in case something goes wrong.
    Map.prototype.get = orig;
    if (!_this.workerScript?.print) {
      // throw, because we have to abort everything **hard**
      let version = "unknown";
      try {
        version = ns.ui.getGameInfo().version;
      } catch (e) {}
      throw new Error(
        `Couldn't hook WorkerScript! Is this the right version of BitBurner? Was expecting 2.3(ish), got ${version}`
      );
    }
    _this.workerScript.print("Successfully hooked WorkerScript!");
  }

  /** @param {NS} ns */
  constructor(ns) {
    ns.printf("Starting...");
    this.hookWorkerScript(ns);
    // If a cleanup function was registered before, call it.
    globalThis.RunInBackgroundCleanupFunc?.();
    const origReact = this.hookReact();
    globalThis.RunInBackgroundCleanupFunc = () => {
      React.createElement = origReact;
    };
    this.registerHandler();
    ns.printf(
      `Background audio has started up ${this.active ? "" : "in"}active.`
    );
    ns.printf("Script will keep functioning in the background.");
  }
}

/** @param {NS} ns */
export function main(ns) {
  new RunInBackground(ns);
}
