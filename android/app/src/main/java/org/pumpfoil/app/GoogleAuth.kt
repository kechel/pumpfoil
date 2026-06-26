package org.pumpfoil.app

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

// „Mit Google anmelden" via Credential Manager. Liefert das Google-ID-Token (JWT),
// das wir an /api/auth/oauth/native/google schicken. serverClientId = unsere WEB-OAuth-
// Client-ID (NICHT die Android-Client-ID) — deren audience prüft der Server.
object GoogleAuth {
    private const val WEB_CLIENT_ID =
        "909326754551-5te81huou2g2qv4vl8j6pbpnhpq4k9ib.apps.googleusercontent.com"

    suspend fun idToken(activity: Context): String {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(WEB_CLIENT_ID)
            .setFilterByAuthorizedAccounts(false)   // auch neue Konten zulassen (Registrierung)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val result = CredentialManager.create(activity).getCredential(activity, request)
        return GoogleIdTokenCredential.createFrom(result.credential.data).idToken
    }
}
