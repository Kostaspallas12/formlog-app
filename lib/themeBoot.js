// Η εμφάνιση (Φωτεινό/Σκούρο) εφαρμόζεται μέσα στο <head>, πριν σχεδιαστεί η σελίδα, ώστε να μην «αναβοσβήνει».
// Ξεχωριστό αρχείο (όχι «use client»), για να το διαβάζει το app/layout.js στον server. Δες lib/theme.js.
export const THEME_KEY = 'formlog_theme';
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
