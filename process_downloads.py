from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from mutagen.id3 import APIC, COMM, TALB, TCON, TDRC, TIT2, TPE1, TPOS, TRCK
from mutagen.mp3 import MP3


def find_triplets(directory: Path) -> list[dict[str, Path]]:
    """Find all complete triplets (audio, tags JSON, cover art) in directory."""
    triplets = []

    json_files = list(directory.glob("*_tags.json"))

    for json_file in json_files:
        base_name = json_file.stem.replace("_tags", "")

        audio_file = None
        for ext in [".m4a", ".mp4", ".mp3", ".flac"]:
            candidate = directory / f"{base_name}{ext}"
            if candidate.exists():
                audio_file = candidate
                break

        if not audio_file:
            print(f"Warning: No audio file found for {json_file.name}")
            continue

        cover_file = None
        for ext in [".jpeg", ".jpg", ".png", ".webp"]:
            candidate = directory / f"{base_name}_cover{ext}"
            if candidate.exists():
                cover_file = candidate
                break

        triplet = {
            "audio": audio_file,
            "tags": json_file,
            "cover": cover_file,
        }

        triplets.append(triplet)
        print(f"Found triplet: {audio_file.name}")
        if cover_file:
            print(f"  - Cover: {cover_file.name}")
        else:
            print(f"  - No cover art found")

    return triplets


def convert_to_mp3(input_file: Path, output_file: Path) -> bool:
    """Convert audio file to MP3 using ffmpeg."""
    try:
        print(f"  Converting {input_file.name} to MP3...")

        cmd = [
            "ffmpeg",
            "-i",
            str(input_file),
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "0",  # Highest quality VBR
            "-y",  # Overwrite output file
            str(output_file),
        ]

        subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )

        return True

    except subprocess.CalledProcessError as e:
        print(f"  Error converting file: {e}")
        print(f"  stderr: {e.stderr.decode()}")
        return False
    except FileNotFoundError:
        print("  Error: ffmpeg not found. Please install ffmpeg.")
        return False


def apply_tags(audio_file: Path, tags_data: dict[str, Any]) -> bool:
    """Apply ID3 tags to MP3 file."""
    try:
        audio = MP3(audio_file)

        if audio.tags is None:
            audio.add_tags()

        if tags_data.get("title"):
            audio.tags.add(TIT2(encoding=3, text=[tags_data["title"]]))

        if tags_data.get("artist"):
            audio.tags.add(TPE1(encoding=3, text=[tags_data["artist"]]))

        if tags_data.get("album"):
            audio.tags.add(TALB(encoding=3, text=[tags_data["album"]]))

        if tags_data.get("year"):
            audio.tags.add(TDRC(encoding=3, text=[tags_data["year"]]))

        if tags_data.get("genre"):
            audio.tags.add(TCON(encoding=3, text=[tags_data["genre"]]))

        if tags_data.get("comment"):
            audio.tags.add(
                COMM(encoding=3, lang="eng", desc="", text=[tags_data["comment"]])
            )

        audio.save()
        print(f"  Tags applied successfully")
        return True

    except Exception as e:
        print(f"  Error applying tags: {e}")
        return False


def embed_cover_art(audio_file: Path, cover_file: Path) -> bool:
    """Embed cover art into MP3 file."""
    try:
        audio = MP3(audio_file)

        if audio.tags is None:
            audio.add_tags()

        with open(cover_file, "rb") as f:
            cover_data = f.read()

        mime_type = "image/jpeg"
        ext = cover_file.suffix.lower()
        if ext == ".png":
            mime_type = "image/png"
        elif ext == ".webp":
            mime_type = "image/webp"

        audio.tags.add(
            APIC(
                encoding=3,
                mime=mime_type,
                type=3,  # Cover (front)
                desc="Cover",
                data=cover_data,
            )
        )

        audio.save()
        print(f"  Cover art embedded successfully")
        return True

    except Exception as e:
        print(f"  Error embedding cover art: {e}")
        return False


def process_triplet(triplet: dict[str, Path]) -> bool:
    """Process a single triplet: convert, tag, and embed cover art."""
    audio_file = triplet["audio"]
    tags_file = triplet["tags"]
    cover_file = triplet.get("cover")

    print(f"\nProcessing: {audio_file.name}")

    try:
        with open(tags_file, "r", encoding="utf-8") as f:
            tags_list = json.load(f)
            if not tags_list:
                print("  Error: Empty tags file")
                return False
            tags_data = tags_list[0]
    except Exception as e:
        print(f"  Error reading tags file: {e}")
        return False

    if audio_file.suffix.lower() == ".mp3":
        mp3_file = audio_file
        print("  Already in MP3 format")
    else:
        mp3_file = audio_file.with_suffix(".mp3")

        if not convert_to_mp3(audio_file, mp3_file):
            return False

    if not apply_tags(mp3_file, tags_data):
        return False

    if cover_file:
        if not embed_cover_art(mp3_file, cover_file):
            print("  Warning: Failed to embed cover art, but continuing...")

    # clean up
    try:
        tags_file.unlink()
        print(f"  Removed tags file: {tags_file.name}")

        if cover_file:
            cover_file.unlink()
            print(f"  Removed cover file: {cover_file.name}")

        if audio_file != mp3_file and audio_file.exists():
            audio_file.unlink()
            print(f"  Removed original file: {audio_file.name}")

    except Exception as e:
        print(f"  Warning: Could not remove some files: {e}")

    print(f"  ✓ Successfully processed: {mp3_file.name}")
    return True


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Process Suno downloads: convert to MP3, apply tags, embed cover art, and clean up"
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Directory to scan for triplets (default: current directory)",
    )

    args = parser.parse_args()

    directory = Path(args.directory).resolve()

    if not directory.exists():
        print(f"Error: Directory not found: {directory}")
        sys.exit(1)

    if not directory.is_dir():
        print(f"Error: Not a directory: {directory}")
        sys.exit(1)

    print(f"Scanning directory: {directory}")
    print()

    triplets = find_triplets(directory)

    if not triplets:
        print("No triplets found!")
        print("\nA triplet consists of:")
        print("  - Audio file (*.m4a, *.mp4, *.mp3, *.flac)")
        print("  - Tags file (*_tags.json)")
        print("  - Cover art (*_cover.jpeg/jpg/png/webp) [optional]")
        sys.exit(0)

    print(f"\nFound {len(triplets)} triplet(s)")
    print()

    success_count = 0
    for triplet in triplets:
        if process_triplet(triplet):
            success_count += 1

    print("\n" + "=" * 50)
    print(f"Successfully processed: {success_count}/{len(triplets)} triplets")
    print("=" * 50)


if __name__ == "__main__":
    main()
