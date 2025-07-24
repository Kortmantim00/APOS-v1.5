import os
import json


def convert_landmarks(input_folder):
    landmarks = []

    for filename in os.listdir(input_folder):
        if filename.endswith(".json"):
            file_path = os.path.join(input_folder, filename)
            try:
                with open(file_path, 'r') as file:
                    data = json.load(file)

                    for markup in data.get("markups", []):
                        for point in markup.get("controlPoints", []):
                            landmarks.append({
                                "id": point.get("id"),
                                "label": point.get("label"),
                                "position": {
                                    "x": point.get("position", [0, 0, 0])[0],
                                    "y": point.get("position", [0, 0, 0])[1],
                                    "z": point.get("position", [0, 0, 0])[2]
                                },
                                "description": point.get("description", ""),
                                "visible": point.get("visibility", True)
                            })

            except Exception as e:
                print(f"Error processing {filename}: {e}")

    return landmarks

