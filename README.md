# Fridge Fairy

Build a mobile-first web app called "FridgeChef" (or suggest a catchier name) that turns a photo of your fridge into dinner ideas in seconds.



PROBLEM: People stare into the fridge and don't know what to cook with what they already have. They waste food and money ordering takeout.



TARGET USERS: 18-35 year olds, students, young professionals, busy parents.



CORE FLOW (max 3 screens):

1. Home: one big "Snap your fridge" button. No signup required.

2. The user takes or uploads a photo. AI detects the ingredients and shows them as editable chips (add/remove items).

3. Results: 3 recipe suggestions with photo-style cards, cooking time, difficulty, and step-by-step instructions. Prioritize recipes using ONLY what the user has, and show "missing 1-2 ingredients" options.



FILTERS (simple toggles): Quick (under 15 min), Healthy, Cheap, High-protein, Vegetarian.



VIRAL MECHANICS:

- Shareable "My fridge challenge" card: fridge photo + the dish created + "Made from leftovers in 12 min", with a small app watermark, one-tap share to TikTok/Instagram stories

- Weekly streak: "Zero food waste days" counter

- Save favorites and a "Cooked it!" button that adds to a personal cookbook

- Invite a friend to unlock bonus recipe packs



DESIGN:

- Modern, minimal, warm food-friendly palette with one accent color

- Large rounded buttons, smooth animations, dark mode

- Fast loading, works great on small phone screens



TECH:

- Responsive, PWA-ready, installable on the home screen

- Use an AI vision API for ingredient detection, with manual entry as fallback

- Save data locally first, optional account later

- Clean, extendable code



ALSO GENERATE:

- A one-line slogan

- App store description

- 5 short TikTok video ideas to promote it (e.g. "I asked AI to cook with my empty fridge")

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fridgefairy-gr.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/deceb039-bd04-5f16-bc53-df7f59dba427).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
