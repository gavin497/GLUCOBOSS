'use client';

import { useMemo, useState } from 'react';

type Recipe = {
  id: string;
  title: string;
  meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
  carbs: number;
  serves: number;
  tags: string[];
  ingredients: string[];
  method: string[];
};

type TimelineItem = {
  id: string;
  kind: 'insulin' | 'food';
  value: number;
  time: string;
  icon: string;
  title: string;
  detail: string;
  createdAt?: string;
  foodDetails?: string;
};

const LOG_STORAGE_KEY = 'glucoboss-manual-logs-v1';

const recipes: Recipe[] = [
  {
    id: 'egg-avocado-toast',
    title: 'Egg & avocado toast',
    meal: 'Breakfast',
    carbs: 24,
    serves: 1,
    tags: ['Quick', 'Protein'],
    ingredients: ['1 slice wholegrain toast', '1 egg', '½ avocado', 'Tomato or cucumber'],
    method: ['Toast the bread.', 'Cook the egg to preference.', 'Top toast with avocado and egg; serve with vegetables.'],
  },
  {
    id: 'greek-yoghurt-berries',
    title: 'Greek yoghurt, berries & nuts',
    meal: 'Breakfast',
    carbs: 20,
    serves: 1,
    tags: ['No cook', 'Protein'],
    ingredients: ['150g plain Greek yoghurt', '80g berries', '15g chopped nuts', 'Optional cinnamon'],
    method: ['Add yoghurt to a bowl.', 'Top with berries and nuts.', 'Check the yoghurt label because carbohydrate varies by brand.'],
  },
  {
    id: 'chicken-wrap',
    title: 'Chicken salad wrap',
    meal: 'Lunch',
    carbs: 32,
    serves: 1,
    tags: ['Lunchbox', 'Protein'],
    ingredients: ['1 medium wholegrain wrap', 'Cooked chicken', 'Lettuce', 'Tomato', 'Cucumber', 'Plain yoghurt dressing'],
    method: ['Fill the wrap with chicken and vegetables.', 'Add a small amount of dressing.', 'Roll tightly and slice.'],
  },
  {
    id: 'tuna-bean-salad',
    title: 'Tuna & bean salad bowl',
    meal: 'Lunch',
    carbs: 28,
    serves: 1,
    tags: ['Fibre', 'No cook'],
    ingredients: ['½ tin drained beans', '1 small tin tuna', 'Tomato', 'Cucumber', 'Peppers', 'Olive oil and lemon'],
    method: ['Rinse and drain the beans.', 'Combine with tuna and chopped vegetables.', 'Dress with olive oil and lemon.'],
  },
  {
    id: 'chicken-rice-bowl',
    title: 'Chicken, vegetable & rice bowl',
    meal: 'Dinner',
    carbs: 45,
    serves: 1,
    tags: ['Balanced', 'Family meal'],
    ingredients: ['100g cooked chicken', '120g cooked rice', 'Mixed vegetables', 'Soy sauce or lemon'],
    method: ['Cook or reheat the chicken and vegetables.', 'Add the measured cooked rice.', 'Season lightly and serve.'],
  },
  {
    id: 'salmon-potatoes',
    title: 'Salmon, potatoes & greens',
    meal: 'Dinner',
    carbs: 34,
    serves: 1,
    tags: ['Omega-3', 'Family meal'],
    ingredients: ['Salmon fillet', '150g cooked potatoes', 'Broccoli or green beans', 'Lemon'],
    method: ['Bake or pan-cook the salmon.', 'Cook and weigh the potatoes.', 'Serve with plenty of green vegetables and lemon.'],
  },
  {
    id: 'apple-peanut-butter',
    title: 'Apple with peanut butter',
    meal: 'Snack',
    carbs: 20,
    serves: 1,
    tags: ['Quick', 'Fibre'],
    ingredients: ['1 small apple', '1 tbsp peanut butter'],
    method: ['Slice the apple.', 'Serve with peanut butter for dipping.', 'Check peanut butter label for added sugar.'],
  },
  {
    id: 'veg-omelette',
    title: 'Vegetable omelette',
    meal: 'Dinner',
    carbs: 8,
    serves: 1,
    tags: ['Lower carb', 'Protein'],
    ingredients: ['2 eggs', 'Peppers', 'Mushrooms', 'Spinach', 'A little cheese'],
    method: ['Cook the vegetables briefly.', 'Add beaten eggs.', 'Cook until set and finish with a little cheese if wanted.'],
  },
];

function currentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function RecipesPage() {
  const [meal, setMeal] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [message, setMessage] = useState('');

  const filtered = useMemo(() => recipes.filter((recipe) => {
    const mealMatches = meal === 'All' || recipe.meal === meal;
    const q = search.trim().toLowerCase();
    const searchMatches = !q || `${recipe.title} ${recipe.tags.join(' ')} ${recipe.ingredients.join(' ')}`.toLowerCase().includes(q);
    return mealMatches && searchMatches;
  }), [meal, search]);

  function logRecipe(recipe: Recipe) {
    try {
      const raw = window.localStorage.getItem(LOG_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const timeline: TimelineItem[] = Array.isArray(existing) ? existing : [];
      const portions = recipe.carbs / 10;
      const entry: TimelineItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'food',
        value: portions,
        time: currentTime(),
        icon: '🍴',
        foodDetails: recipe.title,
        title: recipe.title,
        detail: `${portions} portion${portions === 1 ? '' : 's'} · ~${recipe.carbs}g carbohydrate · recipe estimate`,
        createdAt: new Date().toISOString(),
      };
      window.localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify([entry, ...timeline]));
      setMessage(`${recipe.title} added to the carb log as ~${recipe.carbs}g carbohydrate. Verify the actual ingredients and portion before using the carb figure.`);
    } catch {
      setMessage('Could not save this recipe to the carb log in this browser.');
    }
  }

  return (
    <main className="recipePage">
      <header className="recipeHeader">
        <a href="/dashboard" className="backLink">← Dashboard</a>
        <div className="brand">GLUCO<span>BOSS</span></div>
        <div className="headerTag">RECIPE GUIDE</div>
      </header>

      <section className="recipeHero">
        <div>
          <span className="eyebrow">MEAL IDEAS + CARB AWARENESS</span>
          <h1>What could Jazz eat?</h1>
          <p>Simple meal ideas with an estimated carbohydrate amount per serving. Use the estimate as a starting point, then verify the actual brands, weights and portion before logging or making treatment decisions.</p>
        </div>
      </section>

      <section className="filters">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search recipes or ingredients…" aria-label="Search recipes" />
        <div className="filterButtons">
          {['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack'].map((item) => <button key={item} onClick={() => setMeal(item)} className={meal === item ? 'active' : ''}>{item}</button>)}
        </div>
      </section>

      {message && <div className="message">{message}<a href="/dashboard">View carb log →</a></div>}

      <section className="recipeGrid">
        {filtered.map((recipe) => (
          <article className="recipeCard" key={recipe.id}>
            <div className="recipeTop"><span>{recipe.meal}</span><b>~{recipe.carbs}g carbs</b></div>
            <h2>{recipe.title}</h2>
            <p>{recipe.tags.join(' · ')}</p>
            <div className="carbMetric"><strong>{(recipe.carbs / 10).toFixed(1)}</strong><span>10g carb portions</span></div>
            <div className="cardActions">
              <button onClick={() => setSelected(recipe)}>View recipe</button>
              <button className="logButton" onClick={() => logRecipe(recipe)}>＋ Log meal</button>
            </div>
          </article>
        ))}
      </section>

      <section className="guideNote">
        <strong>Carb-counting note</strong>
        <p>The figures in this prototype are illustrative recipe estimates, not verified nutrition calculations. Packaged-food labels, weighed ingredients and Jazz’s established diabetes plan should take priority.</p>
      </section>

      {selected && <div className="modalBackdrop" onClick={() => setSelected(null)}>
        <section className="recipeModal" onClick={(e) => e.stopPropagation()}>
          <button className="close" onClick={() => setSelected(null)}>×</button>
          <span className="eyebrow">{selected.meal}</span>
          <h2>{selected.title}</h2>
          <div className="modalCarbs">~{selected.carbs}g carbohydrate <span>per serving</span></div>
          <h3>Ingredients</h3>
          <ul>{selected.ingredients.map((ingredient) => <li key={ingredient}>{ingredient}</li>)}</ul>
          <h3>How to make it</h3>
          <ol>{selected.method.map((step) => <li key={step}>{step}</li>)}</ol>
          <button className="primary" onClick={() => logRecipe(selected)}>＋ ADD TO CARB LOG</button>
        </section>
      </div>}

      <style>{`
        * { box-sizing:border-box; }
        .recipePage { min-height:100vh; background:#f4f7f7; color:#10232f; font-family:Arial,Helvetica,sans-serif; padding:0 28px 60px; }
        .recipeHeader { max-width:1500px; margin:0 auto; height:82px; display:grid; grid-template-columns:1fr auto 1fr; align-items:center; }
        .backLink { color:#526873; text-decoration:none; font-weight:800; }
        .brand { font-size:26px; font-weight:950; letter-spacing:-1px; } .brand span { color:#00a889; }
        .headerTag { justify-self:end; font-size:12px; font-weight:900; letter-spacing:1.4px; color:#71848d; }
        .recipeHero { max-width:1500px; margin:18px auto 24px; background:#10232f; color:white; border-radius:28px; padding:36px 42px; }
        .recipeHero h1 { margin:5px 0 10px; font-size:44px; letter-spacing:-1.5px; }
        .recipeHero p { max-width:850px; color:#d6e1e4; font-size:17px; line-height:1.55; margin:0; }
        .eyebrow { color:#00a889; font-size:12px; font-weight:950; letter-spacing:1.4px; }
        .filters { max-width:1500px; margin:0 auto 20px; display:flex; gap:14px; align-items:center; justify-content:space-between; }
        .filters input { width:min(480px,100%); padding:13px 16px; border:1px solid #d7e0e3; border-radius:14px; font-size:16px; background:white; }
        .filterButtons { display:flex; gap:8px; flex-wrap:wrap; }
        .filterButtons button { border:1px solid #d7e0e3; background:white; color:#526873; padding:9px 14px; border-radius:999px; font-weight:850; cursor:pointer; }
        .filterButtons button.active { background:#10232f; color:white; border-color:#10232f; }
        .message { max-width:1500px; margin:0 auto 18px; padding:14px 18px; border-radius:14px; background:#e9f8f4; color:#087966; font-weight:700; display:flex; justify-content:space-between; gap:15px; }
        .message a { color:#087966; }
        .recipeGrid { max-width:1500px; margin:0 auto; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
        .recipeCard { background:white; border:1px solid #e1e8ea; border-radius:20px; padding:20px; box-shadow:0 8px 28px rgba(16,35,47,.05); }
        .recipeTop { display:flex; justify-content:space-between; gap:8px; color:#71848d; font-size:12px; font-weight:900; text-transform:uppercase; }
        .recipeTop b { color:#087966; }
        .recipeCard h2 { font-size:22px; margin:14px 0 6px; }
        .recipeCard p { color:#71848d; min-height:36px; margin:0; }
        .carbMetric { margin:18px 0; background:#f4f8f7; padding:14px; border-radius:14px; display:flex; align-items:baseline; gap:8px; }
        .carbMetric strong { font-size:28px; } .carbMetric span { color:#71848d; font-size:12px; font-weight:800; }
        .cardActions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .cardActions button,.primary { border:0; border-radius:12px; padding:11px 12px; font-weight:900; cursor:pointer; background:#e9eff1; color:#10232f; }
        .cardActions .logButton,.primary { background:#00a889; color:white; }
        .guideNote { max-width:1500px; margin:22px auto 0; background:#fff8e6; border:1px solid #f4deb0; padding:18px 20px; border-radius:16px; }
        .guideNote strong { font-size:15px; } .guideNote p { margin:6px 0 0; color:#6e6245; line-height:1.5; }
        .modalBackdrop { position:fixed; inset:0; background:rgba(5,18,26,.58); display:grid; place-items:center; padding:20px; z-index:20; }
        .recipeModal { width:min(620px,100%); max-height:90vh; overflow:auto; background:white; border-radius:24px; padding:28px; position:relative; }
        .close { position:absolute; right:18px; top:16px; border:0; background:#eef3f4; width:36px; height:36px; border-radius:50%; font-size:24px; cursor:pointer; }
        .recipeModal h2 { font-size:30px; margin:8px 0 10px; }
        .modalCarbs { font-size:24px; font-weight:950; color:#087966; margin-bottom:20px; } .modalCarbs span { font-size:13px; color:#71848d; }
        .recipeModal h3 { margin:20px 0 8px; } .recipeModal li { margin:7px 0; line-height:1.4; }
        .primary { width:100%; margin-top:20px; font-size:15px; }
        @media(max-width:1050px){ .recipeGrid{grid-template-columns:repeat(2,minmax(0,1fr));} }
        @media(max-width:720px){
          .recipePage{padding:0 14px 40px}.recipeHeader{height:68px;grid-template-columns:1fr auto}.headerTag{display:none}.brand{font-size:22px}.recipeHero{padding:26px 22px;border-radius:20px}.recipeHero h1{font-size:34px}.filters{align-items:stretch;flex-direction:column}.filters input{width:100%}.recipeGrid{grid-template-columns:1fr}.message{flex-direction:column}.cardActions{grid-template-columns:1fr 1fr}
        }
      `}</style>
    </main>
  );
}
