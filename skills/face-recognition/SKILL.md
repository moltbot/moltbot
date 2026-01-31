---
name: face-recognition
description: "Learn and recognize faces of family, friends, and pets. Capture, store, and identify people by name using camera."
homepage: https://github.com/openclaw/openclaw
metadata:
  openclaw:
    emoji: "👤"
    requires:
      bins:
        - python3
    install:
      - id: pip
        kind: pip
        package: face_recognition
        bins:
          - face_recognition
        label: "Install face_recognition (pip)"
---

# 👤 Face Recognition

Learn and recognize faces of family members, friends, coworkers, and even pets! The AI remembers faces by name and identifies them in future photos.

## Features

| Feature          | Description                          |
| ---------------- | ------------------------------------ |
| 📷 Learn Face    | Capture and store a face with a name |
| 🔍 Identify      | Recognize who's in a photo           |
| 👨‍👩‍👧‍👦 Family Album  | Manage known faces database          |
| 🐕 Pet Detection | Works with pets too!                 |

---

## Setup

### Install Dependencies

```bash
# macOS
brew install cmake
pip3 install face_recognition opencv-python numpy

# Linux
sudo apt-get install cmake libopenblas-dev liblapack-dev
pip3 install face_recognition opencv-python numpy
```

### Create Faces Directory

```bash
mkdir -p ~/.openclaw/faces
```

---

## 1. 📷 Learn a New Face

Save a person's face with their name. Run this command with the photo path and person's name:

```bash
python3 -c "
import face_recognition, pickle, os, sys

if len(sys.argv) < 3:
    print('Usage: python3 <script> /path/to/photo.jpg \"Person Name\"')
    sys.exit(1)

image_path, name = sys.argv[1], sys.argv[2]
FACES_DIR = os.path.expanduser('~/.openclaw/faces')
os.makedirs(FACES_DIR, exist_ok=True)
db_path = os.path.join(FACES_DIR, 'faces.pkl')

image = face_recognition.load_image_file(image_path)
encodings = face_recognition.face_encodings(image)

if not encodings:
    print('❌ No face found in image')
    sys.exit(1)

db = pickle.load(open(db_path, 'rb')) if os.path.exists(db_path) else {'names': [], 'encodings': []}
db['names'].append(name)
db['encodings'].append(encodings[0])
pickle.dump(db, open(db_path, 'wb'))
print(f'✅ Learned {name}! Total known faces: {len(db[\"names\"])}')
" /path/to/photo.jpg "Person Name"
```

**Example:**

```bash
python3 -c "..." ~/photos/dad.jpg "Dad"
# Output: ✅ Learned Dad! Total known faces: 1
```

---

## 2. 🔍 Identify Faces in a Photo

Recognize who's in a photo:

```bash
python3 -c "
import face_recognition, pickle, os, sys

if len(sys.argv) < 2:
    print('Usage: python3 <script> /path/to/photo.jpg')
    sys.exit(1)

image_path = sys.argv[1]
FACES_DIR = os.path.expanduser('~/.openclaw/faces')
db_path = os.path.join(FACES_DIR, 'faces.pkl')

if not os.path.exists(db_path):
    print('❌ No faces learned yet! Use learn command first.')
    sys.exit(1)

db = pickle.load(open(db_path, 'rb'))
image = face_recognition.load_image_file(image_path)
face_locations = face_recognition.face_locations(image)
face_encodings = face_recognition.face_encodings(image, face_locations)

print(f'Found {len(face_encodings)} face(s):')
for i, enc in enumerate(face_encodings, 1):
    matches = face_recognition.compare_faces(db['encodings'], enc, 0.6)
    dists = face_recognition.face_distance(db['encodings'], enc)
    if True in matches:
        best_idx = dists.argmin()
        confidence = (1 - dists[best_idx]) * 100
        print(f'  {i}. {db[\"names\"][best_idx]} ({confidence:.1f}%)')
    else:
        print(f'  {i}. Unknown')
" /path/to/photo.jpg
```

**Example:**

```bash
python3 -c "..." ~/photos/family_dinner.jpg
# Output:
# Found 3 face(s):
#   1. Dad (92.1%)
#   2. Mom (88.5%)
#   3. Unknown
```

---

## 3. 📋 List Known Faces

See who's in your database:

```bash
python3 -c "
import pickle, os

db_path = os.path.expanduser('~/.openclaw/faces/faces.pkl')
if not os.path.exists(db_path):
    print('No faces learned yet')
    exit()

db = pickle.load(open(db_path, 'rb'))
unique_names = list(set(db['names']))
print('Known faces:')
for i, name in enumerate(unique_names, 1):
    count = db['names'].count(name)
    print(f'  {i}. {name} ({count} photo(s))')
print(f'Total: {len(db[\"names\"])} entries')
"
```

---

## 4. 🗑️ Remove a Face

Remove someone from the database:

```bash
python3 -c "
import pickle, os, sys

if len(sys.argv) < 2:
    print('Usage: python3 <script> \"Person Name\"')
    sys.exit(1)

name_to_remove = sys.argv[1]
db_path = os.path.expanduser('~/.openclaw/faces/faces.pkl')

if not os.path.exists(db_path):
    print('No faces database found')
    sys.exit(1)

db = pickle.load(open(db_path, 'rb'))
indices = [i for i, n in enumerate(db['names']) if n == name_to_remove]

if not indices:
    print(f'No entries found for {name_to_remove}')
    sys.exit(1)

for i in reversed(indices):
    db['names'].pop(i)
    db['encodings'].pop(i)

pickle.dump(db, open(db_path, 'wb'))
print(f'Removed {len(indices)} entries for {name_to_remove}')
" "Person Name"
```

---

## 5. 🐕 Pet Recognition

Works with pets too! Just use a clear photo of your pet's face:

```bash
# Learn your pet
python3 -c "..." ~/photos/dog.jpg "Max the Dog"

# Identify later
python3 -c "..." ~/photos/family_with_pet.jpg
# Output: Found: Max the Dog (85.3%)
```

---

## Example Workflow

1. **Setup Family**:

   ```bash
   # Learn each family member (use the learn command from section 1)
   python3 -c "..." ~/photos/dad.jpg "Dad"
   python3 -c "..." ~/photos/mom.jpg "Mom"
   python3 -c "..." ~/photos/sister.jpg "Sarah"
   python3 -c "..." ~/photos/dog.jpg "Max"
   ```

2. **Identify in Group Photo**:
   ```bash
   python3 -c "..." ~/photos/family_dinner.jpg
   # Output:
   # Found 4 face(s):
   #   1. Dad (92.1%)
   #   2. Mom (88.5%)
   #   3. Sarah (90.3%)
   #   4. Unknown  # Maybe a guest!
   ```

---

## Tips

- 📸 Use **clear, well-lit photos** for better recognition
- 👤 **Multiple photos per person** improves accuracy
- 🔄 **Re-learn** if someone changes hairstyle/appearance significantly
- 💾 **Backup** `~/.openclaw/faces/` to preserve your database
- ⚡ **Tolerance**: Lower = stricter matching, Higher = more lenient (default: 0.6)
