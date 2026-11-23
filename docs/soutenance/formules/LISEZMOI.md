# Formules du diaporama

Les formules sont écrites en LaTeX dans `jobs.mjs`, puis converties en images SVG par MathJax
(le lecteur de diapositives n'exécute aucun script, il faut donc les préparer à l'avance).

```bash
npm install mathjax-full@3.2.2
node render.mjs ./jobs.mjs out.json   # une image SVG par formule dans out.json
```

Les images obtenues sont collées dans `project/slides/mdp.html` et `project/slides/corrections.html`.
