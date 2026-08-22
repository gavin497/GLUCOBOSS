# GLUCOBOSS V0.1

Mobile-first PWA prototype for Type 1 diabetes MDI daily management.

## Included
- Responsive MDI cockpit/dashboard
- Current and previous glucose with trend
- Dummy 12-hour CGM chart
- Insulin-on-board and carbs-on-board cards
- Ultra-fast insulin logging modal with 0.5u increments
- Ultra-fast carb portion logging modal
- Unified glucose/insulin/food timeline
- Voice and photo entry placeholders
- Treatment recommendation logic intentionally disabled in V0.1

## Connections / planned integrations

### Bluetooth kitchen / nutrition scales
Add support for compatible Bluetooth food scales so GLUCOBOSS can receive an actual measured food weight directly from the scale.

Planned workflow:
1. User photographs food and AI identifies the likely food item.
2. GLUCOBOSS clearly labels the photo-based carbohydrate result as an estimate only.
3. User optionally weighs the food on a compatible Bluetooth scale.
4. The measured gram weight is sent to GLUCOBOSS.
5. GLUCOBOSS combines the measured weight with verified nutritional data to refine the carbohydrate calculation.
6. The user reviews and confirms the carbohydrate value before it is used anywhere else in the app.

Potential ecosystems / reference products to investigate:
- Sencor FOOD smart kitchen scales
- RENPHO Smart Nutrition Scale / RENPHO Health
- Etekcity Smart Nutrition Scale / VeSync
- Other Bluetooth Low Energy kitchen scales with an open protocol, documented BLE characteristics, or manufacturer SDK suitable for direct integration

Integration preference: where possible, connect the scale directly to GLUCOBOSS rather than requiring the manufacturer's companion app.

### Carb-photo safety requirement
Photo-based carbohydrate recognition must always be presented as an estimate, never as an exact measurement. Portion size, ingredients, recipes and food preparation may be impossible to determine accurately from an image.

Suggested in-app warning:

> **CARB ESTIMATE ONLY**  
> This estimate is based on a photograph and may be significantly inaccurate. For a more reliable carbohydrate calculation, weigh the food using kitchen scales and use verified nutritional information. Do not rely solely on a photo estimate when making insulin or other diabetes treatment decisions.

Even a weight-based calculation should be described as a higher-confidence calculation rather than exact, because carbohydrate values can vary by recipe, brand, variety and preparation method.

Photo-derived carbohydrate values must be explicitly confirmed by the user before they can be passed into any future insulin-dose calculation workflow.

## Run locally
```bash
npm install
npm run dev
```
Then open http://localhost:3000

## Safety / scope
This is a UX prototype using dummy data only. It does not provide clinical dosing recommendations and must not be used for treatment decisions.
