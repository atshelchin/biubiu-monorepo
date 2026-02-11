<script lang="ts">
  import SEO from '@shelchin/seo-sveltekit/SEO.svelte';
  import { SITE_NAME, DOMAIN } from '$lib/config';
</script>

<SEO
  title="Common Cold - Symptoms, Causes, and Treatment"
  description="Learn about the common cold, its symptoms, causes, risk factors, and effective treatment options. Medical information reviewed by healthcare professionals."
  siteName={SITE_NAME}
  domain={DOMAIN}
  ogType="website"
  twitterCard="summary_large_image"
  twitterSite="@seodemo"
  jsonLd={{
    type: 'MedicalCondition',
    data: {
      name: 'Common Cold',
      alternateName: ['Acute Viral Rhinopharyngitis', 'Upper Respiratory Infection'],
      description: 'A viral infectious disease of the upper respiratory tract that primarily affects the respiratory mucosa of the nose, throat, sinuses, and larynx.',
      image: `${DOMAIN}/api/og?title=Common Cold&type=website&subtitle=Medical Information`,
      associatedAnatomy: {
        type: 'AnatomicalSystem',
        name: 'Respiratory System',
      },
      cause: [
        { type: 'MedicalCause', name: 'Rhinovirus' },
        { type: 'MedicalCause', name: 'Coronavirus' },
        { type: 'MedicalCause', name: 'Respiratory Syncytial Virus' },
      ],
      signOrSymptom: [
        { type: 'MedicalSignOrSymptom', name: 'Runny nose' },
        { type: 'MedicalSignOrSymptom', name: 'Sore throat' },
        { type: 'MedicalSignOrSymptom', name: 'Coughing' },
        { type: 'MedicalSignOrSymptom', name: 'Sneezing' },
        { type: 'MedicalSignOrSymptom', name: 'Mild headache' },
        { type: 'MedicalSignOrSymptom', name: 'Low-grade fever' },
      ],
      riskFactor: [
        { type: 'MedicalRiskFactor', name: 'Age (children under 6)' },
        { type: 'MedicalRiskFactor', name: 'Weakened immune system' },
        { type: 'MedicalRiskFactor', name: 'Seasonal changes (fall and winter)' },
        { type: 'MedicalRiskFactor', name: 'Exposure to infected individuals' },
      ],
      possibleTreatment: [
        { type: 'MedicalTherapy', name: 'Rest and hydration', description: 'Getting adequate rest and drinking plenty of fluids' },
        { type: 'Drug', name: 'Over-the-counter pain relievers', description: 'Acetaminophen or ibuprofen for fever and aches' },
        { type: 'Drug', name: 'Decongestants', description: 'To relieve nasal congestion' },
        { type: 'MedicalTherapy', name: 'Throat lozenges', description: 'To soothe sore throat' },
      ],
      primaryPrevention: [
        { type: 'LifestyleModification', name: 'Frequent handwashing' },
        { type: 'LifestyleModification', name: 'Avoiding close contact with sick people' },
        { type: 'LifestyleModification', name: 'Not touching face with unwashed hands' },
      ],
      possibleComplication: [
        { type: 'MedicalCondition', name: 'Acute ear infection' },
        { type: 'MedicalCondition', name: 'Sinusitis' },
        { type: 'MedicalCondition', name: 'Asthma exacerbation' },
      ],
      epidemiology: 'Adults average 2-3 colds per year; children may have 6-8 colds annually.',
      expectedPrognosis: 'Most cases resolve within 7-10 days without medical treatment.',
      typicalTest: [
        { type: 'MedicalTest', name: 'Physical examination' },
        { type: 'MedicalTest', name: 'Nasal swab (rarely needed)' },
      ],
    },
  }}
  ogParams={{
    type: 'website',
    subtitle: 'Health Information',
  }}
/>

<h1>Common Cold</h1>

<section>
  <h2>MedicalCondition JSON-LD Schema</h2>
  <p>
    This page demonstrates the <code>MedicalCondition</code> structured data type.
    Google may display this health information in a special format in search results.
  </p>

  <h3>Schema Features:</h3>
  <ul>
    <li>Condition name and alternate names</li>
    <li>Associated anatomy</li>
    <li>Causes and risk factors</li>
    <li>Signs and symptoms</li>
    <li>Treatments and prevention</li>
    <li>Possible complications</li>
    <li>Epidemiology and prognosis</li>
  </ul>
</section>

<section style="margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
  <strong>Medical Disclaimer:</strong> This information is for educational purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment.
</section>

<section style="margin-top: 2rem;">
  <h2>Overview</h2>
  <p>
    The common cold is a viral infectious disease of the upper respiratory tract.
    It primarily affects the nose, throat, sinuses, and larynx. Most adults experience
    2-3 colds per year, while children may have 6-8 annually.
  </p>
</section>

<section style="margin-top: 2rem;">
  <h2>Symptoms</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
    {#each ['Runny nose', 'Sore throat', 'Coughing', 'Sneezing', 'Headache', 'Low fever'] as symptom}
      <div style="padding: 1rem; background: #fee2e2; border-radius: 8px; text-align: center;">
        <span style="font-size: 1.5rem;">🤒</span>
        <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">{symptom}</p>
      </div>
    {/each}
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Causes</h2>
  <p>The common cold is caused by various viruses, most commonly:</p>
  <ul>
    <li><strong>Rhinovirus</strong> - responsible for up to 50% of cases</li>
    <li><strong>Coronavirus</strong> - causes about 15% of cases</li>
    <li><strong>Respiratory Syncytial Virus (RSV)</strong></li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>Treatment</h2>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
    <div style="padding: 1rem; background: #d1fae5; border-radius: 8px;">
      <h4 style="margin-top: 0;">💧 Rest & Hydration</h4>
      <p style="font-size: 0.9rem; margin: 0;">Get plenty of rest and drink lots of fluids</p>
    </div>
    <div style="padding: 1rem; background: #dbeafe; border-radius: 8px;">
      <h4 style="margin-top: 0;">💊 Pain Relievers</h4>
      <p style="font-size: 0.9rem; margin: 0;">OTC medications for fever and aches</p>
    </div>
    <div style="padding: 1rem; background: #fef3c7; border-radius: 8px;">
      <h4 style="margin-top: 0;">🌡️ Decongestants</h4>
      <p style="font-size: 0.9rem; margin: 0;">To relieve nasal congestion</p>
    </div>
  </div>
</section>

<section style="margin-top: 2rem;">
  <h2>Prevention</h2>
  <ul>
    <li>Wash hands frequently with soap and water</li>
    <li>Avoid close contact with people who are sick</li>
    <li>Don't touch your face with unwashed hands</li>
    <li>Clean and disinfect frequently touched surfaces</li>
  </ul>
</section>

<section style="margin-top: 2rem;">
  <h2>Prognosis</h2>
  <p style="padding: 1rem; background: #d1fae5; border-radius: 8px;">
    <strong>Good news:</strong> Most cases of the common cold resolve within 7-10 days without medical treatment.
    If symptoms persist beyond 10 days or worsen significantly, consult a healthcare provider.
  </p>
</section>

<section style="margin-top: 2rem;">
  <h2>OG Image Preview</h2>
  <p>
    <a href="/api/og?title=Common Cold&type=website&subtitle=Health Information" target="_blank">
      View OG Image
    </a>
  </p>
</section>
