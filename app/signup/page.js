import SignupForm from './SignupForm';

// Τα κουμπιά της αρχικής στέλνουν ?type=personal ή ?type=coach για να είναι ήδη επιλεγμένος ο τύπος.
// Από πρόσκληση προπονητή έρχεται ?next=/join/…: τότε ο λογαριασμός είναι πάντα προσωπικός.
export default async function SignupPage({ searchParams }) {
  const { type, next } = await searchParams;
  const fromInvite = typeof next === 'string' && next.startsWith('/join/');
  return (
    <SignupForm
      initialType={!fromInvite && type === 'coach' ? 'coach' : 'personal'}
      fromInvite={fromInvite}
      next={fromInvite ? next : null}
    />
  );
}
