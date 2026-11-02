'use client';

import { useEffect, useState } from 'react';
import { fetchInsulinSettings, saveInsulinSettings, verifyFamilyMember } from '../../lib/glucoboss-cloud';

type MealKey = 'breakfast' | 'lunch' | 'dinner';
type RatioKey = `${MealKey}Units` | `${MealKey}Grams`;
type SettingKey = RatioKey | 'sensitivity' | 'target' | 'duration' | 'increment' | 'rapidInsulin' | 'lantusUnits' | 'lantusTime';
type Setting = { key: SettingKey; label: string; unit: string; help: string };
const ratioFields: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
];
const correctionFields: Setting[] = [
  { key: 'sensitivity', label: 'Correction factor (ISF)', unit: 'mg/dL per 1 unit', help: 'How much one unit is prescribed to lower glucose' },
  { key: 'target', label: 'Correction target', unit: 'mg/dL', help: 'The glucose target for corrections from the diabetes care plan' },
  { key: 'duration', label: 'Insulin action duration', unit: 'hours', help: 'Clinician-approved insulin activity setting for the rapid insulin used' },
  { key: 'increment', label: 'Dose increment', unit: 'units', help: 'Smallest increment available on the prescribed insulin pen' },
];
const initialValues: Record<SettingKey, string> = {
  breakfastUnits: '', breakfastGrams: '',
  lunchUnits: '', lunchGrams: '',
  dinnerUnits: '', dinnerGrams: '',
  sensitivity: '', target: '', duration: '', increment: '', rapidInsulin: '', lantusUnits: '', lantusTime: '',
};
function positiveNumber(value: string) {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n > 0;
}

const STORAGE_KEY = 'glucoboss-prescribed-ratio-settings-v1';

export default function CalculatorSetupPage() {
  const [values, setValues] = useState<Record<SettingKey, string>>(initialValues);
  const [copyStatus, setCopyStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [savedAt, setSavedAt] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const member = await verifyFamilyMember();
        if (!member) throw new Error('Please sign in as an authorised family member from the dashboard.');
        const remote = await fetchInsulinSettings();
        if (cancelled) return;
        setCloudReady(true);
        if (remote) {
          const restored = { ...initialValues };
          for (const key of Object.keys(initialValues) as SettingKey[]) {
            if (typeof remote.values[key] === 'string') restored[key] = remote.values[key];
          }
          setValues(restored);
          setSavedAt(remote.updatedAt);
          setSaveStatus('Settings loaded from the shared family database.');
        } else {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const stored = JSON.parse(raw);
            if (stored?.values && typeof stored.values === 'object') {
              const restored = { ...initialValues };
              for (const key of Object.keys(initialValues) as SettingKey[]) {
                if (typeof stored.values[key] === 'string') restored[key] = stored.values[key];
              }
              setValues(restored);
              setDirty(true);
              setSaveStatus('Previous settings found on this device. Tap Save Settings to upload them for the family.');
            }
          } else {
            setSaveStatus('No shared settings yet. Enter prescribed settings and tap Save Settings.');
          }
        }
      } catch (error) {
        if (!cancelled) setSaveStatus(error instanceof Error ? error.message : 'Could not load family settings. Sign in and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  async function saveSettings() {
    if (loading || saving) return;
    if (!cloudReady) {
      setSaveStatus('Not connected to the family database. Please sign in from the dashboard and reopen this page.');
      return;
    }
    for (const field of ratioFields) {
      const units = values[`${field.key}Units`];
      const grams = values[`${field.key}Grams`];
      if ((units.trim() || grams.trim()) && !(positiveNumber(units) && positiveNumber(grams))) {
        setSaveStatus(`Cannot save: ${field.label} needs both positive units and grams.`);
        return;
      }
    }
    for (const field of correctionFields) {
      if (values[field.key].trim() && !positiveNumber(values[field.key])) {
        setSaveStatus(`Cannot save: ${field.label} must be a positive number.`);
        return;
      }
    }
    if (values.lantusUnits.trim() && !positiveNumber(values.lantusUnits)) {
      setSaveStatus('Cannot save: Lantus units must be a positive number.');
      return;
    }
    try {
      setSaving(true);
      setSaveStatus('Saving to the shared family database…');
      const saved = await saveInsulinSettings(values);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ values: saved.values, savedAt: saved.updatedAt }));
      setSavedAt(saved.updatedAt);
      setDirty(false);
      setSaveStatus('Saved to Supabase. Settings are available to signed-in family members on other devices.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed. No changes were confirmed in the database.');
    } finally { setSaving(false); }
  }
  const update = (key: SettingKey, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setCopyStatus('');
    setSaveStatus('Unsaved changes');
    setDirty(true);
  };
  async function copyForReview() {
    const rows = [
      'GLUCOBOSS — clinician-prescribed settings for review (NOT a dosing recommendation)',
      ...ratioFields.filter((field) => values[`${field.key}Units`].trim() || values[`${field.key}Grams`].trim()).map((field) => {
        const units = values[`${field.key}Units`];
        const grams = values[`${field.key}Grams`];
        return `${field.label}: ${positiveNumber(units) && positiveNumber(grams) ? `${units} units : ${grams} g carbs` : 'INCOMPLETE — needs both positive values'}`;
      }),
      ...correctionFields.filter((field) => values[field.key].trim()).map((field) => `${field.label}: ${values[field.key].trim()} ${field.unit}`),
      ...(values.rapidInsulin.trim() ? [`Rapid-acting insulin: ${values.rapidInsulin.trim()}`] : []),
      ...(values.lantusUnits.trim() ? [`Prescribed Lantus overnight basal: ${values.lantusUnits.trim()} units`]: []),
      ...(values.lantusTime.trim() ? [`Scheduled Lantus time: ${values.lantusTime.trim()}`]: []),
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
  const completeRatios = ratioFields.filter((field) => positiveNumber(values[`${field.key}Units`]) && positiveNumber(values[`${field.key}Grams`])).length;
  const enteredCount = completeRatios + correctionFields.filter((field) => values[field.key].trim()).length + (values.rapidInsulin.trim() ? 1 : 0) + (values.lantusUnits.trim() ? 1 : 0) + (values.lantusTime.trim() ? 1 : 0);

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
        <div className="calcSectionHead"><span className="calcNumber">1</span><div><h2>Insulin-to-carb ratios</h2><p>Enter <strong>both sides</strong> of the prescribed ratio: insulin units and grams of carbohydrate. For example, 0.5 units : 10 g. Leave unknown ratios blank.</p></div></div>
        <div className="calcFields">
          {ratioFields.map((field) => {
            const unitsKey: RatioKey = `${field.key}Units`;
            const gramsKey: RatioKey = `${field.key}Grams`;
            return <div key={field.key} className="calcField">
              <strong className="calcMealName">{field.label}</strong>
              <div className="calcRatioRow">
                <label className="calcRatioPart">
                  <span>Insulin units</span>
                  <input type="number" min="0.01" step="any" inputMode="decimal" value={values[unitsKey]} onChange={(event) => update(unitsKey, event.target.value)} placeholder="e.g. 1" aria-label={`${field.label} insulin units`}/>
                </label>
                <span className="calcRatioColon" aria-hidden="true">:</span>
                <label className="calcRatioPart">
                  <span>Carbs (grams)</span>
                  <input type="number" min="0.1" step="any" inputMode="decimal" value={values[gramsKey]} onChange={(event) => update(gramsKey, event.target.value)} placeholder="e.g. 15" aria-label={`${field.label} carbohydrate grams`}/>
                </label>
              </div>
              {(values[unitsKey] || values[gramsKey]) && !(positiveNumber(values[unitsKey]) && positiveNumber(values[gramsKey])) && <p className="calcRatioHelp">Enter a positive number in both boxes.</p>}
            </div>;
          })}
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

      <section className="calcSection">
        <div className="calcSectionHead"><span className="calcNumber">3</span><div><h2>Overnight long-acting insulin — Lantus</h2><p>Record Jazz&apos;s prescribed basal insulin schedule. This is for reference only, not a calculator for changing the Lantus dose.</p></div></div>
        <div className="calcFields">
          <label className="calcField">
            <span>Prescribed Lantus dose (units)</span>
            <div className="calcInputWrap"><input type="number" min="0.1" step="any" inputMode="decimal" value={values.lantusUnits} onChange={(event) => update('lantusUnits', event.target.value)} placeholder="From care plan" aria-label="Prescribed overnight Lantus dose in units"/><small>units</small></div>
          </label>
          <label className="calcField">
            <span>Usual overnight injection time</span>
            <div className="calcInputWrap"><input type="time" value={values.lantusTime} onChange={(event) => update('lantusTime', event.target.value)} aria-label="Usual Lantus injection time"/></div>
          </label>
        </div>
        <p className="calcRatioHelp">Lantus is long-acting basal insulin, separate from meal and correction doses. This setting does not calculate, recommend, adjust, or record an injection. Follow Jazz&apos;s prescribed plan.</p>
      </section>

      <section className="calcSection calcPreview">
        <div className="calcSectionHead"><span className="calcNumber">4</span><div><h2>Estimator design</h2><p>Planned calculation stages — no active dose output yet.</p></div></div>
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
        <p>Entered {enteredCount} of 10 settings ({completeRatios} of 3 complete meal ratios). <strong>Save to the shared family database</strong> so signed-in devices see the same settings.</p>
        <button type="button" onClick={saveSettings} disabled={loading || saving || !cloudReady} className="calcCopy">{saving ? 'Saving…' : loading ? 'Loading settings…' : dirty ? 'Save changes to cloud' : 'Save settings to cloud'}</button>
        <button type="button" onClick={copyForReview} className="calcCopy" style={{ marginLeft: 10, background: '#294958' }}>Copy prescribed settings</button>
        {saveStatus && <p className="calcFeedback" role="status">{saveStatus}</p>}
        {savedAt && <p style={{ marginTop: 9, fontWeight: 700 }}>Last saved: {new Date(savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
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
        .calcField > span, .calcMealName { display: block; font-size: 16px; font-weight: 900; margin-bottom: 9px; }
        .calcRatioRow { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: end; gap: 8px; }
        .calcRatioPart { display: flex; flex-direction: column; min-width: 0; gap: 6px; }
        .calcRatioPart span { font-size: 15px; font-weight: 800; color: #405663; }
        .calcRatioPart input { width: 100%; min-width: 0; box-sizing: border-box; font-size: 22px; font-weight: 800; padding: 12px 8px; border: 2px solid #afc5cc; border-radius: 11px; color: #10232f; background: #fff; }
        .calcRatioPart input:focus { outline: 3px solid #76d6c4; outline-offset: 2px; }
        .calcRatioColon { font-size: 26px; font-weight: 900; padding-bottom: 12px; }
        .calcRatioHelp { color: #9a3412 !important; font-size: 14px !important; font-weight: 750; margin-top: 8px !important; }
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
