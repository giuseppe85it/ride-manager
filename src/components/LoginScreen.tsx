import { signInWithGoogle } from "../firebase/authService";

export default function LoginScreen() {
  return (
    <div style={{
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column"
    }}>
      <h2>RideManager</h2>
      <button onClick={signInWithGoogle}>
        Accedi con Google
      </button>
    </div>
  );
}
