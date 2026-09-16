import io
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image

import ocr


class OCRTests(unittest.TestCase):
    def image(self, size=(175, 45), color=255):
        buffer = io.BytesIO()
        Image.new("L", size, color).save(buffer, format="PNG")
        return buffer.getvalue()

    def test_tinyocr_input_and_ctc_mapping(self):
        class FakeSession:
            def get_inputs(self):
                return [type("Input", (), {"name": "image"})()]

            def run(self, outputs, inputs):
                pixels = inputs["image"]
                np.testing.assert_array_equal(pixels, np.ones((1, 1, 45, 175), dtype=np.float32))
                logits = np.zeros((1, 8, 37), dtype=np.float32)
                for position, category in enumerate([11, 11, 0, 11, 2, 0, 3, 0]):
                    logits[0, position, category] = 1
                return [logits]

        with patch.object(ocr, "_session", FakeSession()):
            self.assertEqual(ocr.solve(self.image()), "aa12")

    def test_wrong_dimensions_are_not_resized(self):
        with patch.object(ocr, "_session", object()):
            with self.assertRaisesRegex(ValueError, "dimensions"):
                ocr.solve(self.image((176, 45)))


if __name__ == "__main__":
    unittest.main()
