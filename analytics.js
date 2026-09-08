(()=>{
  const MEASUREMENT_ID='G-JME803LE5Y';
  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
  window.gtag('js',new Date());
  window.gtag('config',MEASUREMENT_ID,{
    anonymize_ip:true,
    transport_type:'beacon'
  });

  const script=document.createElement('script');
  script.async=true;
  script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  const track=(name,params={})=>{
    if(typeof window.gtag!=='function') return;
    window.gtag('event',name,{
      page_path:location.pathname,
      page_title:document.title,
      ...params
    });
  };
  window.pdTrack=track;

  const buttonEvents={
    runBtn:['diagnosis_run',{tool:'diagnose'}],
    regRunBtn:['regression_run',{tool:'regression'}],
    compatRun:['compatibility_run',{tool:'compatibility'}],
    exportJsonBtn:['report_export',{tool:'diagnose',format:'json'}],
    exportMdBtn:['report_export',{tool:'diagnose',format:'markdown'}],
    regJsonBtn:['report_export',{tool:'regression',format:'json'}],
    regMdBtn:['report_export',{tool:'regression',format:'markdown'}],
    compatJson:['report_export',{tool:'compatibility',format:'json'}],
    compatMd:['report_export',{tool:'compatibility',format:'markdown'}],
    copyReportBtn:['report_copy',{tool:'diagnose'}],
    regCopyBtn:['report_copy',{tool:'regression'}],
    compatCopy:['report_copy',{tool:'compatibility'}],
    saveBaselineBtn:['baseline_save',{tool:'diagnose'}],
    regFeedbackBtn:['feedback_open',{source:'regression'}]
  };

  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');
    if(!target) return;
    if(target.id&&buttonEvents[target.id]){
      const [name,params]=buttonEvents[target.id];
      track(name,params);
    }
    if(target.matches('a[href*="guides.html"],a[href*="/errors/"]')){
      track('guide_open',{destination:target.getAttribute('href')||''});
    }
    if(target.matches('a[href*="feedback.html"],a[href*="github.com/Reridy/paradox-doctor/issues"]')){
      track('feedback_open',{destination:target.getAttribute('href')||''});
    }
    if(target.matches('a[href^="https://github.com/"]')){
      track('outbound_github',{destination:target.getAttribute('href')||''});
    }
  },{passive:true});
})();
