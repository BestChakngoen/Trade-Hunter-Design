- **Build Frequency Constraint:** If the modification is minor (such as simple text renaming, minor translations, or trivial layout adjustments that do not introduce new Tailwind classes or custom CSS rules), you do NOT need to execute `npm run build` (or equivalent build steps) every time. Save build execution only for major changes or when new CSS utility classes are added.
- **Mandatory Test Execution on Major Changes, Clean Code & Refactoring:** ต้องทำการรันคำสั่งทดสอบ (เช่น `node --check` สำหรับตรวจสอบไวยากรณ์สคริปต์ JS และ `npm run build` สำหรับตรวจสอบระบบ Build/CSS) **ทุกครั้ง** เมื่อมีการเปลี่ยนแปลงโค้ดขนาดใหญ่ (Major Changes), การทำ Clean Code หรือการ Refactor โค้ด เพื่อยืนยันความถูกต้องและรับประกันว่าระบบไร้ข้อผิดพลาดก่อนจบงานเสมอ


---

## 🎯 1. มาตรฐานการทำงาน (Development Standards)
ในการเขียนโค้ดและแนะนำวิธีแก้ไข ให้ยึดหลักการต่อไปนี้เสมอ:
* **Best Practices:** เขียนโค้ดที่สะอาด (Clean Code) มีระเบียบ และรองรับการขยายระบบ (Scalability)
- **OOP & SOLID Principles:** เขียนโค้ดตามหลักการ OOP และ SOLID Principles อย่างเคร่งครัด และแยกตรรกะการคำนวณ (Business/Math Logic) ออกจากส่วนแสดงผล/ควบคุมเหตุการณ์ (View/Event Controllers)
- **Strict No God Object:** ห้ามสร้าง God Object หรือ God Class ที่รวมความรับผิดชอบ (Responsibilities) หรือตรรกะหลายอย่างไว้ในคลาส/ออบเจกต์เดียวโดยเด็ดขาด ต้องยึดหลัก Single Responsibility Principle (SRP) อย่างเคร่งครัด โดยแยกส่วนการคำนวณ (Business/Math Logic), การจัดการสถานะ (State Management), และส่วนแสดงผล/ควบคุมเหตุการณ์ (View/Event Controllers) ออกเป็นคลาสหรือโมดูลย่อยที่ชัดเจนและมีหน้าที่เฉพาะเจาะจง
* **Security First:** ป้องกันช่องโหว่พื้นฐาน เช่น SQL Injection, XSS, CSRF และปฏิบัติตามมาตรฐาน OWASP
* **Performance:** Optimization ทั้งความเร็ว (Loading Speed) และการจัดการหน่วยความจำ (Memory Management)
* **Responsive Design:** รองรับการแสดงผลทุกหน้าจอ (Mobile, Tablet, Desktop) แบบ Mobile-First
* **No Auto-Commits:** ห้ามใช้เครื่องมือหรือรันคำสั่ง Git Commit (เช่น `git add`, `git commit`) โดยเด็ดขาด ให้ทิ้งไฟล์ที่แก้ไขไว้ในสถานะไม่คอมมิต (Uncommitted Workspace) เพื่อให้ผู้ใช้งานเป็นผู้จัดการและควบคุม Version Control ด้วยตัวเองทั้งหมด
* **Credit Economy & Multi-Agent Restriction:** ใช้เครดิตอย่างประหยัด หากไม่จำเป็นจริงๆ ไม่ต้องใช้ Multi-agent และต้องได้รับอนุญาตจากผู้ใช้งานก่อนเสมอ จึงจะสามารถทำงานที่มีโอกาสบริโภคหรือเผาเครดิตจำนวนมากได้
* **Confirm Before Action & Ask Questions:** ก่อนจะทำการเขียนโค้ด ปรับแก้ หรือลงมือทำอะไรก็ตาม ต้องพูดคุย สอบถาม และยืนยันแนวทางกับผู้ใช้งานก่อนเสมอ หากมีส่วนใดไม่เข้าใจหรือมีข้อสงสัย ให้เอ่ยปากถามผู้ใช้งานโดยตรง ห้ามคิดเองทำเองหรือคาดเดาเจตนาเองโดยเด็ดขาด

---

## 🔄 Code Refactoring Rules (กฎการ Refactor โค้ด)
- **ทำความเข้าใจภาพรวม:** ทำความเข้าใจภาพรวมของโครงสร้างระบบและ Architecture ก่อนเริ่มทำการ Refactor
- **OOP & SOLID Principles:** เขียนโค้ดตามหลักการ OOP และ SOLID Principles อย่างเคร่งครัด
- **หลีกเลี่ยง God Class:** หลีกเลี่ยงการเขียน God Class / God Object ที่รวม Responsibilities ไว้มากเกินไป
- **รักษาพฤติกรรมเดิมของระบบ:** การ Refactor ต้องรักษาฟังก์ชันการทำงานเดิม และทำให้ระบบต่างๆ ทำงานได้ถูกต้องเหมือนเดิมทุกประการ
- **ย่อยไฟล์และโมดูล:** ย่อยไฟล์ให้มีขนาดสั้นลง แยกส่วนการทำงานออกเป็นโมดูลย่อยๆ เพื่อให้ง่ายต่อการอ่าน และกลับมาแก้ไขปรับปรุงในอนาคต
- **ตรวจสอบผลลัพธ์:** ตรวจสอบและทดสอบผลลัพธ์หลังการ Refactor ให้มั่นใจว่าทำงานได้ตรงตามระบบเดิมอย่างแม่นยำ

---

## 🧹 Clean Code & Behavior Preservation Rules (กฎการ Clean Code และรักษาพฤติกรรมเดิมของระบบ)
- **Clean Code & Zero Regression:** ทุกการเขียนโค้ด ปรับปรุง หรือทำ Clean Code ต้องเขียนโค้ดให้สะอาด มีระเบียบ อ่านง่าย อ่านเข้าใจได้ทันที (Readable & Maintainable) โดย **ห้ามกระทบต่อพฤติกรรมเดิม (Behavior Preservation), ฟังก์ชันเดิม หรือทำให้การทำงานใดๆ ของระบบเดิมเปลี่ยนแปลงหรือผิดเพี้ยนไปโดยเด็ดขาด**
- **รักษาความถูกต้องของการทำงาน (Preserve Existing Functionality):** การลบส่วนที่ไม่จำเป็น (Unused Code) หรือจัดระเบียบโครงสร้างใหม่ ต้องได้รับการตรวจสอบและทดสอบอย่างถี่ถ้วน ให้มั่นใจว่าระบบยังคงทำงานได้ถูกต้องตรงตามข้อกำหนดเดิมทุกประการ

---

## 🎨 CSS & Styling Rules (กฎการจัดการ Style และ CSS)
- **รวบรวมไฟล์ CSS:** ไฟล์ CSS ทั้งหมดที่เป็น Source Code ให้จัดเก็บรวบรวมไว้ในโฟลเดอร์ `css/` เดียวกัน
- **แยกไฟล์ Style ใหม่:** เมื่อมีการออกแบบการใช้ Style ใหม่ ให้จัดทำ Style นั้นแยกเป็นไฟล์ `.css` ให้อยู่ในโฟลเดอร์ `css/` แล้วเรียกใช้ (หรือ `@import`) เพื่อให้ง่ายต่อการดูแลและแก้ไขปรับปรุง