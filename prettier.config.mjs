/** @type {import("prettier").Config} */
const config = {
  semi: false,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./app/globals.css",
  tailwindFunctions: ["cn", "cva"],
}

export default config
