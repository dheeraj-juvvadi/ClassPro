# ClassPro
## Better way to manage your academics.
View, predict, and strategize your success.

---

> [!TIP]
> ClassPro is now self-hostable! You can run your very own ClassPro instance.
> - `NEXT_PUBLIC_URL` is the [backend](https://github.com/rahuletto/goscraper) that you have to deploy it by yourself and link it
> - `NEXT_PUBLIC_VALIDATION_KEY` should be an unique key that should match with the backend server.. This key is used to validate if the requests are authentic and from desired frontend
> - `NEXT_PUBLIC_SERVICE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` should be your supabase SERVICE key and ANON key.
>
> Host it, get the url, use it and enjoy! 

### `.env`
```
NEXT_PUBLIC_URL=""
NEXT_PUBLIC_VALIDATION_KEY=""
NEXT_PUBLIC_SERVICE_KEY=""
NEXT_PUBLIC_SUPABASE_URL=""
```

> [!WARNING]
> We will **NOT** take account for anything caused by your self-hosted instance

## Development

```bash
pnpm install
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SERVICE_KEY` configure optional persistence for saved optional hours. The production build succeeds without them; related API routes return HTTP 503 until they are supplied.

## Why Choose ClassPro?

- **Academic overview:** Timetable, course list, attendance, marks, calendar, faculty contacts, and resources.
- **Attendance planning:** Predict outcomes and mark optional hours with validated persistence.
- **Responsive controls:** Touch-sized navigation, labeled fields, visible focus states, and reduced-motion support.
- **Local-first typography:** Fraunces, Sora, and IBM Plex Mono are self-hosted for consistent rendering.
- **Timetable Generation:** Creates a full timetable based on your class schedule.
- **Attendance Prediction:** Predicts the percent based on your expected leave days
- **Safe and Secure:** Built with privacy and security in mind.
- **No Bloat:** Streamlined and efficient, with no unnecessary bloatware.

### The Idea Behind ClassPro

This project was intended to show the timetable and attendance. but it grew and scaled to a full-on replacement to SRM Academia. We made sure to use the web-standards and the best-in-class approaches to make sure our service is `fast`, `easy-to-use` and `easy on eyes`.


## Contributors

See the repository contributor graph for the complete contributor list.


---

## [License](https://creativecommons.org/licenses/by-nc-nd/4.0/)

### You are free to:

- **Share:** Copy and redistribute the material in any medium or format.

### Under the following terms:

- **Attribution:** You must give appropriate credit, provide a link to the license, and indicate if changes were made. You may do so in any reasonable manner, but not in any way that suggests the licensor endorses you or your use.
- **NonCommercial:** You may not use the material for commercial purposes.
- **NoDerivatives:** If you remix, transform, or build upon the material, you may not distribute the modified material.
