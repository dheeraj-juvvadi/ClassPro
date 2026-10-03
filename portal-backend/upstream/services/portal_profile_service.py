import re
from selectolax.parser import HTMLParser
from utils.text import TextUtils

class PortalProfileService:
    @staticmethod
    def academic_summary(html_content):
        parser = HTMLParser(html_content or "")
        result = {}
        labels = {
            "current cgpa": "currentCgpa", "cgpa": "currentCgpa",
            "cumulative grade point average": "currentCgpa", "overall cgpa": "currentCgpa",
            "completed credits": "completedCredits", "credits earned": "completedCredits",
            "total credits earned": "completedCredits", "earned credits": "completedCredits",
            "total earned credits": "completedCredits", "credits completed": "completedCredits",
        }
        for row in parser.css("tr"):
            cells = row.css("td, th")
            if len(cells) < 2: continue
            texts = [TextUtils.clean(cell.text(separator=" ", strip=True)) for cell in cells]
            for index, label in enumerate(texts[:-1]):
                key = labels.get(re.sub(r"\s+", " ", label.lower()).strip(" :"))
                if not key: continue
                value = texts[index + 1]
                match = re.fullmatch(r"(\d{1,3}(?:\.\d{1,3})?)(?:\s*/\s*10)?", value)
                if not match: continue
                number = float(match.group(1))
                maximum = 10 if key == "currentCgpa" else 400
                if 0 <= number <= maximum: result[key] = number
        if result: result["academicSummarySource"] = "Student Portal"
        return result

    @staticmethod
    def parse(html_content):
        if not html_content:
            return {}
        
        parser = HTMLParser(html_content)
        profile = {
            "name": "",
            "regNo": "Unknown",
            "batch": "N/A",
            "semester": "N/A",
            "dept": "N/A",
            "section": "N/A",
            "mobile": "N/A",
            "program": "N/A"
        }
        
        for tr in parser.css("table tr"):
            tds = tr.css("td")
            if len(tds) >= 2:
                label = TextUtils.clean(tds[0].text(strip=True)).lower()
                val = TextUtils.clean(tds[1].text(strip=True))
                if "student name" in label:
                    profile["name"] = val
                elif "register no" in label:
                    profile["regNo"] = val
                elif "institution" in label or "department" in label:
                    profile["dept"] = val
                elif "program" in label:
                    profile["program"] = val
                elif "batch" in label:
                    profile["batch"] = val
                elif "semester" in label:
                    profile["semester"] = val
                elif "section" in label:
                    profile["section"] = val
                elif "student mobile" in label or "mobile" in label:
                    profile["mobile"] = val

        profile.update(PortalProfileService.academic_summary(html_content))
        return profile
