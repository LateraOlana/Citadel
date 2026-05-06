# 🏰 Citadel · A daily city game

A geography game inspired by Wordle and Globle. Each day, one of 592 well-known world cities (197 capitals + 395 major cities) is hidden. Guess any city, see how far away it is, get a compass arrow and a "warmth" pin on the world map, with the warmest guess crowned with a gold ★. Keep guessing until you find it.

## Latin-keyboard friendly

Every city accepts Latin/ASCII variants. You can type:

- `Sao Paulo` for São Paulo
- `Reykjavik` for Reykjavík
- `Yaounde` for Yaoundé
- `Ndjamena` for N'Djamena
- `Munchen` for München (Munich)
- `Cote d'Ivoire` or `Cote divoire`

Plus historical / colloquial alternates:

- `Bombay` → Mumbai · `Calcutta` → Kolkata · `Madras` → Chennai · `Bangalore` → Bengaluru
- `Saigon` → Ho Chi Minh City · `Rangoon` → Yangon · `Peking` → Beijing
- `Leningrad` / `St Petersburg` → Saint Petersburg · `Kiev` → Kyiv · `Bucuresti` → Bucharest
- `Wien` → Vienna · `Roma` → Rome · `Lisboa` → Lisbon · `Praha` → Prague
- `Swaziland` → Eswatini · `Macedonia` → North Macedonia · `Cote d'Ivoire` → Ivory Coast

The autocomplete surfaces aliases too — typing `bomb` brings up Mumbai, `leningrad` brings up Saint Petersburg.

## Disambiguating cities with the same name

Some cities share names: London (UK / Canada), Valencia (Spain / Venezuela), Córdoba (Argentina / Spain), Victoria (Seychelles / Canada). Two ways to disambiguate:

1. **Use the autocomplete dropdown** — both cities appear; pick the one you want.
2. **Type "City, Country"** — e.g. `London, Canada` resolves uniquely.

Plain `London` defaults to London, UK (since it's a capital, marked ★).


## Credits

- Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · © [CARTO](https://carto.com/attributions)
- Built with [Leaflet](https://leafletjs.com/)
- Type: **Fraunces** (display) + **Inter** (body) + **JetBrains Mono** (numbers)
