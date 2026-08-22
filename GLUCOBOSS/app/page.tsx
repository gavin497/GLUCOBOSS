export default function Home() {
  return (
    <main className="landingPage">
      <header className="landingHeader">
        <a className="landingBrand" href="#top" aria-label="GLUCOBOSS home">GLUCO<span>BOSS</span></a>
        <nav className="landingNav" aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="#connections">Connections</a>
          <a href="#safety">Safety</a>
          <a href="/dashboard" className="navCta">Open prototype</a>
        </nav>
      </header>

      <section className="landingHero" id="top">
        <div className="heroCopy">
          <div className="heroKicker">TYPE 1 DIABETES · MDI MANAGEMENT</div>
          <h1>Less logging.<br/><span>More living.</span></h1>
          <p className="heroLead">GLUCOBOSS brings glucose, insulin, food and everyday diabetes decisions into one clear, fast dashboard designed for real life.</p>
          <div className="heroActions">
            <a href="/dashboard" className="primaryCta">Explore the prototype <span>→</span></a>
            <a href="#features" className="textCta">See how it works</a>
          </div>
          <div className="heroTrust"><span>●</span> Built around CGM data, quick logging and caregiver visibility</div>
        </div>

        <div className="heroVisual" aria-label="GLUCOBOSS product preview">
          <div className="phoneFrame">
            <div className="phoneTop"><span>9:41</span><span>● ● ●</span></div>
            <div className="phoneBrand">GLUCO<span>BOSS</span></div>
            <div className="phoneGlucose">
              <small>CURRENT GLUCOSE</small>
              <div><strong>112</strong><b>→</b></div>
              <span>mg/dL · now</span>
            </div>
            <div className="miniGraph" aria-hidden="true">
              <svg viewBox="0 0 320 95"><path d="M5,70 C30,55 45,65 70,48 S110,35 135,50 S175,72 205,44 S250,42 315,28" fill="none"/><line x1="0" x2="320" y1="22" y2="22"/><line x1="0" x2="320" y1="77" y2="77"/></svg>
            </div>
            <div className="phoneTiles">
              <div><small>INSULIN ON BOARD</small><strong>2.1 <em>u</em></strong></div>
              <div><small>CARBS ON BOARD</small><strong>1.5 <em>portions</em></strong></div>
            </div>
            <button>＋ Quick log</button>
          </div>
          <div className="floatingCard photoCard"><span>📷</span><div><b>Photo carb estimate</b><small>Estimate first. Weigh to verify.</small></div></div>
          <div className="floatingCard cgmCard"><span>↗</span><div><b>Live CGM</b><small>Connected and updating</small></div></div>
        </div>
      </section>

      <section className="landingStrip">
        <p>One place for the things that usually live in different apps, notes and conversations.</p>
        <div><span>GLUCOSE</span><i>+</i><span>INSULIN</span><i>+</i><span>FOOD</span><i>+</i><span>VOICE</span><i>+</i><span>CAREGIVERS</span></div>
      </section>

      <section className="landingSection" id="features">
        <div className="sectionIntro">
          <div className="sectionKicker">DESIGNED FOR SPEED</div>
          <h2>Diabetes management without the admin feeling.</h2>
          <p>GLUCOBOSS is being designed around the moments that happen dozens of times a day: checking glucose, logging insulin, estimating food and understanding what happened next.</p>
        </div>
        <div className="featureGrid">
          <article className="featureCard featureDark"><span className="featureIcon">↗</span><h3>Live glucose at a glance</h3><p>See current glucose, direction and recent movement without digging through multiple screens.</p><div className="featureStat"><b>112</b><span>mg/dL →</span></div></article>
          <article className="featureCard"><span className="featureIcon">💉</span><h3>Fast insulin logging</h3><p>Large, deliberate controls make it quick to record insulin while reducing accidental taps.</p><div className="mockChips"><span>0.5</span><span>1.0</span><span>1.5</span><span>2.0</span></div></article>
          <article className="featureCard"><span className="featureIcon">🍽️</span><h3>Smarter food logging</h3><p>Log carb portions, use voice, or start with a photo estimate and refine it using verified weights.</p><div className="foodFlow"><span>📷 Photo</span><b>→</b><span>⚖️ Weigh</span><b>→</b><span>✓ Confirm</span></div></article>
          <article className="featureCard"><span className="featureIcon">🎙️</span><h3>Say it instead</h3><p>Voice-first logging is planned for the moments when opening a form is the last thing you want to do.</p><div className="voiceWave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article>
        </div>
      </section>

      <section className="connectionsSection" id="connections">
        <div className="connectionsCopy">
          <div className="sectionKicker">CONNECTIONS</div>
          <h2>Connect the data you already rely on.</h2>
          <p>GLUCOBOSS is being built to become the layer that brings diabetes data together, rather than another isolated app.</p>
          <div className="connectionList">
            <div><span className="connectionIcon">◉</span><div><b>CGM & Nightscout</b><small>Live glucose feeds and trend data</small></div><em>IN PROGRESS</em></div>
            <div><span className="connectionIcon">⚖️</span><div><b>Bluetooth food scales</b><small>Direct weight capture for higher-confidence carb calculations</small></div><em>PLANNED</em></div>
            <div><span className="connectionIcon">⌁</span><div><b>Smart device ecosystem</b><small>Future integrations for diabetes hardware and health platforms</small></div><em>ROADMAP</em></div>
          </div>
        </div>
        <div className="connectionVisual">
          <div className="centralNode">G<span>B</span></div>
          <div className="orbit orbitOne"><span>CGM</span></div>
          <div className="orbit orbitTwo"><span>⚖️</span></div>
          <div className="orbit orbitThree"><span>📱</span></div>
          <div className="orbit orbitFour"><span>☁️</span></div>
        </div>
      </section>

      <section className="safetySection" id="safety">
        <div className="safetyBadge">SAFETY FIRST</div>
        <h2>An estimate should always look like an estimate.</h2>
        <p>Photo-based carbohydrate recognition can be useful, but portion size and ingredients can be wrong. GLUCOBOSS will clearly label image-based results as estimates and encourage users to weigh food and use verified nutritional information before making treatment decisions.</p>
        <div className="safetyExample">
          <div><small>PHOTO ESTIMATE</small><strong>~55g</strong><span>Low / medium confidence</span></div>
          <b>→</b>
          <div className="verified"><small>AFTER WEIGHING</small><strong>~32g</strong><span>Higher-confidence calculation</span></div>
        </div>
        <p className="safetyNote">GLUCOBOSS is currently a prototype. Treatment recommendation logic is intentionally disabled and the product must not be used as a substitute for professional medical advice or validated dosing tools.</p>
      </section>

      <section className="finalCta">
        <div><div className="sectionKicker">THE IDEA IS SIMPLE</div><h2>Make the daily work of Type 1 diabetes feel lighter.</h2></div>
        <a href="/dashboard" className="primaryCta light">Open GLUCOBOSS prototype <span>→</span></a>
      </section>

      <footer className="landingFooter">
        <a className="landingBrand" href="#top">GLUCO<span>BOSS</span></a>
        <p>Prototype for Type 1 diabetes MDI daily management.</p>
        <div><a href="#features">Features</a><a href="#connections">Connections</a><a href="#safety">Safety</a></div>
      </footer>
    </main>
  );
}
