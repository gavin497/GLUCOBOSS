'use client';

import { useState } from 'react';

type SettingKey = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'sensitivity' | 'target' | 'duration' | 'increment' | 'rapidInsulin';
type Setting = { key: SettingKey; label: string; unit: string; help: string };
const ratioFields: Setting[] = [
  { key: 'breakfast', label: 'Breakfast', unit: 'g per 1 unit', help: 'Prescribed breakfast insulin-to-carbohydrate ratio' },
  { key: 'lunch', label: 'Lunch', unit: 'g per 1 unit', help: 'Prescribed lunch insulin-to-carbohydrate ratio' },
  { key: 'dinner', label: 'Dinner', unit: 'g per 1 unit', help: 'Prescribed dinner insulin-to-carbohydrate ratio' },
  { key: 'snack', label: 'Snacks', unit: 'g per 1 unit', help: 'Prescribed snack ratio, if different' },
];
const correctionFields: Setting[] = [
  { key: 'sensitivity', label: 'Correction factor (ISF)', unit: 'mg/dL per 1 unit', help: 'How much one unit is prescribed to lower glucose' },
  { key: 'target', label: 'Correction target', unit: 'mg/dL', help: 'The glucose target for corrections from the diabetes care plan' },
  { key: 'duration', label: 'Insulin action duration', unit: 'hours', help: 'Clinician-approved insulin activity setting for the rapid insulin used' },
  { key: 'increment', label: 'Dose increment', unit: 'units', help: 'Smallest increment available on the prescribed insulin pen' },
];
const allFields = [...ratioFields, ...correctionFields];
const initialValues: Record<SettingKey, string> = {
  breakfast: '', lunch: '', dinner: '', snack: '',
  sensitivity: '', target: '', duration: '', increment: '', rapidInsulin: '',
};

export default function CalculatorSetupPage() {
  const [values, setValues] = useState<Record<SettingKey, string>>(initialValues);
  const [copyStatus, setCopyStatus] = useState('');
  const update = (key: SettingKey, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setCopyStatus('');
  };
  async function copyForReview() {
    const rows = [
      'GLUCOBOSS — clinician-prescribed settings for review (NOT a dosing recommendation)',
      ...allFields.filter((field) => values[field.key].trim()).map((field) => `${field.label}: ${values[field.key].trim()} ${field.unit}`),
      ...(values.rapidInsulin.trim() ? [`Rapid-acting insulin: ${values.rapidInsulin.trim()}`] : []),
    ];
    if (rows.length === 1) {
      setCopyStatus('Enter the prescribed settings first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(rows.join('\n'));
      setCopyStatus('Settings copied. Paste them into our chat for review.');
    } catch {
      setCopyStatus('Could not copy. You can share the prescribed settings directly in chat.');
    }
  }
  const enteredCount = Object.values(values).filter((value) => value.trim()).length;

  return (
    <main className="calcPage">
      <header className="calcTopbar">
        <a href="/dashboard" className="calcBrand" aria-label="Back to GLUCOBOSS dashboard">GLUCO<span>BOSS</span></a>
        <a href="/dashboard" className="calcBack">← Dashboard</a>
      </header>

      <section className="calcHero">
        <span className="calcStatus">SETUP ONLY · NO INSULIN DOSE CALCULATED</span>
        <h1>Carb ratios &amp; dose estimator</h1>
        <p>Let's prepare the settings from Jazz's diabetes care plan before we activate any calculations. Nothing entered here is used to recommend a dose.</p>
      </section>

      <section className="calcSection">
        <div className="calcSectionHead"><span className="calcNumber">1</span><div><h2>Insulin-to-carb ratios</h2><p>Enter the grams of carbohydrate covered by <strong>1 unit</strong> of rapid insulin, as prescribed for each meal. Leave unknown values blank.</p></div></div>
        <div className="calcFields">
          {ratioFields.map((field) => <label key={field.key} className="calcField">
            <span>{field.label}</span>
            <div className="calcInputWrap"><input type="number" min="0.1" step="any" inputMode="decimal" value={values[field.key]} onChange={(event) => update(field.key, event.target.value)} placeholder="Not set" aria-label={field.help}/><small>{field.unit}</small></div>
          </label>)}
        </div>
      </section>

      <section className="calcSection">
        <div className="calcSectionHead"><span className="calcNumber">2</span><div><h2>Correction &amp; insulin settings</h2><p>These must come from Jazz's current prescribed plan, not estimates inferred from a few glucose readings.</p></div></div>
        <div className="calcFields">
          {correctionFields.map((field) => <label key={field.key} className="calcField">
            <span>{field.label}</span>
            <div className="calcInputWrap"><input type="number" min="0.1" step="any" inputMode="decimal" value={values[field.key]} onChange={(event) => update(field.key, event.target.value)} placeholder="Not set" aria-label={field.help}/><small>{field.unit}</small></div>
          </label>)}
          <label className="calcField">
            <span>Rapid-acting insulin</span>
            <div className="calcInputWrap"><input type="text" value={values.rapidInsulin} onChange={(event) => update('rapidInsulin', event.target.value)} placeholder="Name from prescription" aria-label="Name of Jazz's prescribed rapid-acting insulin" /></div>
          </label>
        </div>
      </section>

      <section className="calcSection calcPreview">
        <div className="calcSectionHead"><span className="calcNumber">3</span><div><h2>Estimator design</h2><p>Planned calculation stages — no active dose output yet.</p></div></div>
        <ol className="calcSteps">
          <li>Read planned carbohydrate grams and select the prescribed meal ratio.</li>
          <li>Check current glucose, its timestamp and the prescribed correction settings.</li>
          <li>Account for recent insulin injections, insulin activity and any prescribed correction rules.</li>
          <li>Apply safety checks for low glucose, ketones, illness, exercise and missing data.</li>
          <li>Round only to the permitted pen increment and require a human review before logging.</li>
        </ol>
        <div className="calcWarning"><strong>Not for insulin dosing.</strong> The estimator is disabled until the calculation method, settings and edge cases have been reviewed with Jazz's diabetes team. Keep using his existing treatment plan.</div>
      </section>

      <section className="calcSection calcReview">
        <h2>Share settings for review</h2>
        <p>Entered {enteredCount} of 9 settings. These inputs are temporary: they are <strong>not saved, synced or submitted</strong> to GLUCOBOSS.</p>
        <button type="button" onClick={copyForReview} className="calcCopy">Copy prescribed settings</button>
        {copyStatus && <p className="calcFeedback" role="status">{copyStatus}</p>}
      </section>

      <style jsx>{`
        .calcPage { max-width: 1080px; margin: 0 auto; padding: 20px 20px 80px; color: #10232f; }
        .calcTopbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; gap: 16px; }
        .calcBrand { font-size: 26px; font-weight: 950; letter-spacing: -.05em; text-decoration: none; color: #10232f; }
        .calcBrand span { color: #00a889; }
        .calcBack { color: #0b7066; font-weight: 850; font-size: 17px; }
        .calcHero { border-radius: 23px; padding: 28px; background: #143644; color: #fff; }
        .calcStatus { display: inline-block; padding: 8px 12px; border-radius: 9px; background: #fef3c7; color: #7c2d12; font-size: 13px; font-weight: 950; letter-spacing: .025em; }
        .calcHero h1 { font-size: clamp(30px, 6vw, 46px); line-height: 1.12; margin: 17px 0 10px; }
        .calcHero p { font-size: 19px; line-height: 1.45; margin: 0; max-width: 740px; color: #e1f5f0; }
        .calcSection { background: #fff; border: 1px solid #dbe5e9; border-radius: 20px; margin-top: 18px; padding: 24px; box-shadow: 0 3px 14px rgba(16,35,47,.05); }
        .calcSectionHead { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 18px; }
        .calcNumber { display: inline-grid; flex: 0 0 38px; width: 38px; height: 38px; place-items: center; border-radius: 12px; background: #dcfce7; color: #065f46; font-size: 20px; font-weight: 950; }
        .calcSection h2 { margin: 0 0 6px; font-size: 24px; }
        .calcSection p { margin: 0; font-size: 17px; line-height: 1.45; color: #405663; }
        .calcFields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
        .calcField { display: block; border: 1px solid #dbe5e9; border-radius: 14px; padding: 14px; min-width: 0; }
        .calcField > span { display: block; font-size: 16px; font-weight: 900; margin-bottom: 9px; }
        .calcInputWrap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .calcInputWrap input { min-width: 0; width: 100%; max-width: 220px; font-size: 22px; font-weight: 750; padding: 12px 11px; border: 2px solid #afc5cc; border-radius: 11px; color: #10232f; background: #fff; }
        .calcInputWrap input:focus { outline: 3px solid #76d6c4; outline-offset: 2px; }
        .calcInputWrap small { font-size: 15px; font-weight: 700; color: #526773; }
        .calcSteps { margin: 0; padding-left: 26px; font-size: 17px; line-height: 1.65; }
        .calcSteps li { margin-bottom: 6px; padding-left: 5px; }
        .calcWarning { margin-top: 18px; border-left: 5px solid #d97706; background: #fffbeb; padding: 14px 17px; border-radius: 9px; font-size: 17px; line-height: 1.5; }
        .calcReview .calcCopy { display: inline-block; margin-top: 18px; border: 0; border-radius: 12px; background: #087c70; color: #fff; padding: 15px 20px; font-size: 18px; font-weight: 850; cursor: pointer; }
        .calcFeedback { margin-top: 12px !important; font-weight: 800; color: #075e52 !important; }
        @media (max-width: 650px) {
          .calcPage { padding: 12px 12px 60px; }
          .calcHero { padding: 20px 16px; border-radius: 18px; }
          .calcHero p { font-size: 17px; }
          .calcSection { padding: 17px 14px; border-radius: 16px; }
          .calcSectionHead { gap: 10px; }
          .calcSection h2 { font-size: 21px; }
          .calcFields { grid-template-columns: 1fr; gap: 9px; }
          .calcField { padding: 12px; }
          .calcInputWrap input { max-width: 100%; }
          .calcBack { font-size: 15px; }
        }
      `}</style>
    </main>
  );
}
