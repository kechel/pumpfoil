package org.pumpfoil.app

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

// „Mit Google anmelden" via Credential Manager. Liefert das Google-ID-Token (JWT),
// das wir an /api/auth/oauth/native/google schicken. serverClientId = unsere WEB-OAuth-
// Client-ID (NICHT die Android-Client-ID) — deren audience prüft der Server.
object GoogleAuth {
    private const val WEB_CLIENT_ID =
        "909326754551-5te81huou2g2qv4vl8j6pbpnhpq4k9ib.apps.googleusercontent.com"

    suspend fun idToken(activity: Context): String {
        val cm = CredentialManager.create(activity)
        // 1) Nahtloses Bottom-Sheet (falls ein Konto direkt angeboten werden kann).
        // 2) Fallback auf den expliziten „Sign in with Google"-Button-Flow mit Kontoauswahl —
        //    das behebt „no credentials available", wenn das Bottom-Sheet nichts anbietet.
        val credential = try {
            val opt = GetGoogleIdOption.Builder()
                .setServerClientId(WEB_CLIENT_ID)
                .setFilterByAuthorizedAccounts(false)   // auch neue Konten zulassen (Registrierung)
                .setAutoSelectEnabled(false)
                .build()
            cm.getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(opt).build()).credential
        } catch (e: NoCredentialException) {
            val opt = GetSignInWithGoogleOption.Builder(WEB_CLIENT_ID).build()
            cm.getCredential(activity, GetCredentialRequest.Builder().addCredentialOption(opt).build()).credential
        }
        return GoogleIdTokenCredential.createFrom(credential.data).idToken
    }
}
