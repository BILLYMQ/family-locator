// Adaptateur web — stockage dans localStorage du navigateur
// Metro sélectionne ce fichier automatiquement à la place de storage.ts sur la cible web
export const storage = {
  getItem:    (key: string)                => Promise.resolve(localStorage.getItem(key)),
  setItem:    (key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
  removeItem: (key: string)               => { localStorage.removeItem(key); return Promise.resolve(); },
};
