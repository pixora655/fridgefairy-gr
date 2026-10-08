# AI φωτογραφίες Fridgie — Cloudflare Workers AI Free

## Επιλεγμένη λύση

FLUX.1 Schnell (`@cf/black-forest-labs/flux-1-schnell`) μέσω Cloudflare Workers AI REST API, με 4 diffusion steps. Δεν χρησιμοποιείται χρεώσιμο Gemini image API, ούτε γίνεται fallback σε άλλο μοντέλο ή πάροχο. Το υπάρχον Gemini για ανίχνευση υλικών και κείμενο συνταγών παραμένει αμετάβλητο.

Ο λογαριασμός `mariaxarpadidy@gmail.com` ελέγχθηκε στις 8 Οκτωβρίου 2026 και ήταν στο Workers **Free ($0)**. Πραγματική REST δοκιμή FLUX επέστρεψε JPEG ομελέτας (HTTP 200). Δεν έγινε αναβάθμιση ή προσθήκη πληρωμής. Το αρχικό draft PR προετοιμασίας Gemini αναθεωρήθηκε για αυτήν τη δωρεάν λύση, κατόπιν έγκρισης του χρήστη.

## Δωρεάν όρια και ασφαλής λειτουργία

- Workers AI Free: 10.000 neurons/ημέρα ανά λογαριασμό. Αν εξαντληθούν, οι επιπλέον κλήσεις αποτυγχάνουν στο Free plan αντί να χρεώνονται. Το όριο μοιράζεται με άλλες AI εφαρμογές στον ίδιο λογαριασμό.
- Πρόσθετο όριο εφαρμογής: 100 νέες απόπειρες εικόνων ανά UTC ημέρα συνολικά, όχι ανά χρήστη. Cached εικόνες δεν απαιτούν νέα δημιουργία. Το όριο ορίζεται ρητά σε server variable.
- Δεν αλλάζουμε το Cloudflare Workers πλάνο σε Paid. Αν ο διαχειριστής το αναβαθμίσει αργότερα, οι κανόνες κόστους του παρόχου αλλάζουν. Ο κώδικας δεν διαβάζει το πλάνο μέσω API, καθώς το token έχει μόνο Workers AI Read/Edit και όχι Billing πρόσβαση.
- Netlify hosting/storage/reads/bandwidth καταναλώνουν τα υπάρχοντα όρια του Netlify πλάνου. Δεν ενεργοποιείται αναβάθμιση ή auto-recharge από αυτήν την αλλαγή. Η δωρεάν παραγωγή εικόνων δεν σημαίνει απεριόριστο hosting.
- Αν λείπουν credentials/όριο ή αποτύχει storage/API, εμφανίζεται η υπάρχουσα εικονογράφηση χωρίς να χαλάει η συνταγή.

## Server-only μεταβλητές Netlify

Ποτέ `VITE_*`, ποτέ στο git ή στο browser bundle:

- `AI_RECIPE_IMAGES_ENABLED=true`: ενεργοποιεί δημιουργία εικόνων. Απουσία/false σημαίνει καμία κλήση image API.
- `CLOUDFLARE_ACCOUNT_ID`: account ID επιβεβαιωμένου Free λογαριασμού.
- `CLOUDFLARE_AI_API_TOKEN`: κρυφό token μόνο με Workers AI Read/Edit, περιορισμένο στον συγκεκριμένο λογαριασμό. Όχι Global API Key, όχι DNS/Workers Scripts/Billing δικαιώματα.
- `AI_RECIPE_IMAGES_DAILY_LIMIT=100`: ακέραιος 1–1000. Απουσία/0/μη έγκυρη τιμή απενεργοποιεί τη δημιουργία. Διατηρούμε 100 ή μικρότερο για τη δωρεάν λειτουργία.

Τα τέσσερα server secrets αποθηκεύτηκαν στο Netlify στις 8 Οκτωβρίου 2026, μόνο σε Production και Deploy Previews, χωρίς local-development exposure. Τα previews μοιράζονται site-wide image cache και ημερήσιο μετρητή με production.

## Αντιστοίχιση στη συνταγή και εμφάνιση

Το prompt περιλαμβάνει τίτλο, περιγραφή, υλικά, επιπλέον υλικά και βήματα. Περιορίζεται στα 2048 characters που υποστηρίζει το μοντέλο. Το cache key περιλαμβάνει πλήρη κανονικοποιημένα δεδομένα συνταγής, model και version, ώστε ίδιος τίτλος με διαφορετική παρασκευή να μη μοιράζεται λάθος εικόνα.

Κάθε εικόνα επισημαίνεται `AI image`: είναι ενδεικτική απεικόνιση, όχι φωτογραφία πραγματικού μαγειρεμένου αποτελέσματος. Η αντιστοίχιση είναι best-effort: ένα image model δεν εγγυάται ότι κάθε συστατικό και ποσότητα θα είναι ακριβή. Δεν μεταφέρεται η φωτογραφία ψυγείου στην Cloudflare, μόνο το κείμενο της συνταγής. Δεν επεξεργαζόμαστε ή σβήνουμε αγαπημένα/ιστορικό χρήστη.

Οι εικόνες φορτώνονται όταν η κάρτα πλησιάσει στην οθόνη. Στη λίστα, στις λεπτομέρειες και στα αγαπημένα επαναχρησιμοποιείται το ίδιο κλειδί εικόνας. Οι χρήστες δεν περιμένουν να ολοκληρωθούν όλες οι φωτογραφίες για να δουν τις συνταγές.

## Cache και όρια

- Netlify Blobs store `fridgie-ai-recipe-images-v1` για JSON με base64 image data, μέγιστη εικόνα 2 MB.
- Atomic `onlyIfNew` ανά συνταγή αποτρέπει ταυτόχρονη διπλή δημιουργία μεταξύ server instances.
- Netlify Blobs store `fridgie-ai-image-quotas-v1`: atomic compare-and-swap ημερήσιου μετρητή με strong consistency και `onlyIfMatch` ETag. Failed κλήσεις καταναλώνουν quota επίσης. Δεν γίνεται ακριβός έλεγχος εκατοντάδων quota slots.
- Δεν γίνεται αυτόματο retry provider αιτήματος. `pending`/`failed` κρατήσεις χρειάζονται διοικητικό έλεγχο και ασφαλή καθαρισμό πριν επανάληψη. Αν δεν έχει γίνει provider call λόγω πλήρους ορίου, ελευθερώνεται η κράτηση συνταγής.
- Οι generated εικόνες δεν μπαίνουν στο localStorage. Η μόνιμη server cache καλύπτει reload και αγαπημένα, χωρίς νέα image API κλήση.
- Η δημόσια εφαρμογή δεν έχει authentication: κάποιος μπορεί να εξαντλήσει το συνολικό ημερήσιο όριο. Η ποσόστωση είναι προστασία χρήσης, όχι πλήρης anti-abuse λύση. Μελλοντική προώθηση χρειάζεται ισχυρότερη προστασία.
- Απαιτείται μελλοντική retention/cleanup πολιτική για παλιές εικόνες/μετρητές. Δεν εκτελούνται αυτόματες διαγραφές χωρίς έγκριση.

## Απενεργοποίηση

`AI_RECIPE_IMAGES_ENABLED=false` και νέο deploy σταματούν τις νέες κλήσεις. Ήδη εν εξελίξει κλήσεις και εμφανισμένες cached εικόνες δεν ανακαλούνται. Η παλιά stock φωτογραφία/εικονογράφηση λειτουργεί ως fallback.

## Επαλήθευση πριν τη δημοσίευση

Το REST μοντέλο ελέγχθηκε πραγματικά στο Free plan. Πριν merge χρειάζονται τελικό local build/TypeScript/tests, επιτυχημένο deploy preview, πραγματική εικόνα μέσω εφαρμογής και επιβεβαίωση ότι δεύτερη ίδια συνταγή εξυπηρετείται από Netlify Blobs χωρίς νέα παραγωγή. Μετά merge ελέγχουμε ξανά το `fridgie.site`.

## Επίσημες πηγές

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- https://docs.netlify.com/build/data-and-storage/netlify-blobs/
