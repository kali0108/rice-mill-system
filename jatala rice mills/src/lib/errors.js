import { T } from './i18n.js';
// Turns raw Postgres / network errors into short Roman Urdu messages. Errors
// raised by our own database triggers are already in Roman Urdu and pass
// through unchanged.

export function errorMessage(err) {
  if (!err) return '';
  if (typeof err === 'string') return err;
  return err.message || err.error_description || err.msg || String(err);
}

export function isNetworkError(resOrErr) {
  if (!resOrErr) return false;
  if (resOrErr.status === 0) return true;
  const msg = errorMessage(resOrErr.error || resOrErr);
  return /Failed to fetch|NetworkError|Load failed|FetchError|fetch failed|network request failed|ERR_INTERNET/i.test(msg);
}

// Server problems worth retrying later (not a rejection of the data itself)
export function isRetryableError(res) {
  if (isNetworkError(res)) return true;
  const status = res?.status;
  const code = res?.error?.code || '';
  if (status === 401 || status === 408 || status === 429 || (status >= 500 && status <= 599)) return true;
  return /^PGRST30[0-3]$/.test(code);
}

export function friendlyError(err) {
  const msg = errorMessage(err);
  if (!msg) return T('Kuch ghalat ho gaya — dobara koshish karein.');
  if (/row-level security|permission denied|42501/i.test(msg)) {
    return T('Is kaam ki ijazat (permission) nahi hai. Owner se rabta karein.');
  }
  if (/parties_type_name_uq/i.test(msg)) return T('Is naam aur type ki party pehle se maujood hai.');
  if (/duplicate key|unique constraint/i.test(msg)) return T('Yeh entry pehle se maujood hai (duplicate).');
  if (/JWT expired|invalid jwt|jwt malformed|PGRST30/i.test(msg)) return T('Login session khatam ho gaya — dobara Sign In karein.');
  if (/invalid login credentials/i.test(msg)) return T('Email ya password ghalat hai.');
  if (/email not confirmed/i.test(msg)) return T('Email confirm nahi hui — Supabase mein "Confirm email" OFF karein (guide dekhein).');
  if (/user already registered|already been registered/i.test(msg)) return T('Is email se account pehle se bana hua hai.');
  if (/password should be at least|weak password/i.test(msg)) return T('Password kamzor hai — kam az kam 8 characters rakhein.');
  if (/rate limit|too many requests/i.test(msg)) return T('Bohat zyada koshishen — thori der baad try karein.');
  if (isNetworkError({ error: { message: msg } })) return T('Internet ya server se rabta nahi ho saka. Net check karein.');
  if (/invalid input syntax for type date/i.test(msg)) return T('Tareekh (date) ghalat format mein hai.');
  if (/invalid input syntax for type (numeric|integer|uuid)/i.test(msg)) return T('Kisi khane mein number ki jagah ghalat value hai.');
  if (/violates foreign key/i.test(msg)) return T('Yeh entry kisi aur record se judi hui hai.');
  if (/Could not find the function|function .* does not exist|schema cache/i.test(msg)) {
    return T('Database update nahi hua — Supabase SQL Editor mein naya schema/migration_07 chalayein (DEPLOYMENT_GUIDE dekhein).');
  }
  if (/column .* does not exist|Could not find the '.*' column/i.test(msg)) {
    return T('Database purana hai — migration_07 chalayein (DEPLOYMENT_GUIDE dekhein).');
  }
  return T(msg);
}
