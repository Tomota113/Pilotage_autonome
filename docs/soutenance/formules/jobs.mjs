// Formules du diaporama, en LaTeX (String.raw : les barres obliques restent telles quelles)
export default {
  reward: { tex: String.raw`r_t \;=\; 0{,}1\,\Delta s \;-\; 0{,}01 \;-\; \left(10 + 0{,}01\,v^{2}\right)\mathbf{1}_{\text{sortie}} \;+\; 50\,\mathbf{1}_{\text{tour}} \;-\; 0{,}05\,\left|\Delta\delta\right|`, px: 52, color: "#14181D", label: "r_t = 0,1 Δs − 0,01 − (10 + 0,01 v²) × 1 si sortie + 50 × 1 si tour − 0,05 |Δδ|" },
  ds: { tex: String.raw`+\,0{,}1\,\Delta s`, px: 44, color: "#B3261E", label: "+0,1 Δs" },
  crash_l: { tex: String.raw`-\left(10 + 0{,}01\,v^{2}\right)\mathbf{1}_{\text{sortie}}`, px: 44, color: "#B3261E", label: "−(10 + 0,01 v²) si sortie" },
  lap: { tex: String.raw`+\,50\,\mathbf{1}_{\text{tour}}`, px: 44, color: "#B3261E", label: "+50 si tour bouclé" },
  gamma_d: { tex: String.raw`\gamma = 0{,}99 \;\longrightarrow\; \gamma = 0{,}995`, px: 36, color: "#F2C230", label: "γ = 0,99 → γ = 0,995" },
  crash_d: { tex: String.raw`-10 \;\longrightarrow\; -\left(10 + 0{,}01\,v^{2}\right)`, px: 36, color: "#F2C230", label: "−10 → −(10 + 0,01 v²)" },
  pedal_d: { tex: String.raw`-1\ (\text{frein}) \;\le\; u \;\le\; +1\ (\text{gaz})`, px: 36, color: "#F2C230", label: "pédale entre −1 et +1" },
};
