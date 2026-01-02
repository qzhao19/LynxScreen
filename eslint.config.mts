import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",           
      "**/dist-electron/**",  
      "**/build/**",          
      "**/out/**",            
      "**/node_modules/**",   
    ]
  },
  [{ 
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"], 
    plugins: { js }, 
    extends: [js.configs.recommended],
    languageOptions: { 
      globals: globals.node 
    },
    rules: {
      "semi": ["error", "always"],
      "semi-spacing": ["error", { "before": false, "after": true }],
      "quotes": ["error", "double"]
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);