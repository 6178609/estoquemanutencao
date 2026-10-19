// Regras do Next (Core Web Vitals + TypeScript). Roda no CI (npm run lint) e localmente antes de publicar.
// As regras do React Compiler (o site não usa o compilador) ficam como aviso: apontam usos válidos aqui, como Date.now()
// em componente do servidor e ref lido dentro de um clique.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", ".next-*/**", "node_modules/**", "next-env.d.ts", "public/**"] },
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/incompatible-library": "warn",
      // "_" na frente = ignorado de propósito (ex.: tirar um campo com { campo: _campo, ...resto })
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
    },
  },
  // nos testes, React.createElement com children nas props é o jeito mais curto de montar o elemento
  { files: ["testes/**"], rules: { "react/no-children-prop": "off" } },
];

export default config;
